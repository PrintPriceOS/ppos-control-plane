# SPINE-06R — F01: BFF / Tenancy & Session Context Resolution Fix

**Mission:** SPINE-06R — BFF/Tenancy & Paper Caliper Production Closure  
**Repositories:**  
- `PrintPriceOS/PrintPricePro_BookPrice` (`server/server.js`, `lib/spineApi.ts`, `components/UserMenu.tsx`, `components/BookSpineGeometryPanel.tsx`, `components/AdvancedPaperSelector.tsx`, `App.tsx`)  
- `PrintPriceOS/ppos-control-plane` (`server.js`, `src/api/middleware/auth.js`, `src/api/routes/spineRoutes.js`, `src/api/services/spine/spineCalculationService.js`)

---

## 1. Root Cause Diagnosed in SPINE-06 (`SPINE-06_PARTIAL`)

During **SPINE-06**, when Budget App's BFF (`server/server.js`) proxied requests from `/api/budget/spine/*` to Control Plane (`/api/v1/spine/*`), it called `buildControlPlaneHeaders()`:

```js
const token = jwt.sign(
    { sub: BPE_SYSTEM_USER_ID }, // "bpe-system-user", no tenant_id
    BPE_JWT_SECRET,
    { issuer: BPE_JWT_ISSUER, audience: BPE_JWT_AUDIENCE, expiresIn: 60 }
);
```

In Control Plane (`src/api/routes/spineRoutes.js`), `resolveTrustedTenant(req, res)` rejected any token lacking `tenant_id` with `403 TENANT_CONTEXT_REQUIRED`. Consequently, testers using `https://budget.printprice.pro` could not execute Spine calculations through the BFF unless a valid tenant context was resolved and transported.

---

## 2. Prohibited Anti-Patterns Explicitly Avoided

Per **SPINE-06R F01** governance rules, the following shortcuts were strictly prohibited and verified absent:

1. **No Universal Hardcoded Tenant**: `buildControlPlaneHeaders()` does **not** hardcode `tenant_id: 'ppos-production'` or any default fallback tenant.
2. **No Trust in Client-Supplied `tenant_id`**: Neither Budget App BFF nor Control Plane accepts a free `tenantId` / `tenant_id` / `x-tenant-id` from the browser unless it matches the cryptographically verified session/user tenant. Any mismatch is rejected with `403 FORBIDDEN_TENANT_MISMATCH`.
3. **No Unchecked Global Service Credential (`bpe-system-user`)**: Control Plane (`resolveTrustedTenant` in `src/api/routes/spineRoutes.js`) explicitly blocks `bpe-system-user` / `SYSTEM` tokens from acting on any tenant unless:
   - `bff_delegated === true`, AND
   - Either `delegated_user_id` + `delegated_session_id` OR `delegated_order_id` is present in the signed JWT claims, AND
   - When `delegated_user_id` is present, Control Plane queries `control_users` / `users` to verify that `delegated_user_id` actually belongs to the claimed `tenant_id`.

---

## 3. End-to-End Architecture Implemented (`F01`)

### 3.1 Budget App BFF (`server/server.js`)

1. **Cryptographic Session-to-Tenant Binding on Login (`bindControlPlaneAuthToSession`)**:
   - When a tester logs in via `POST /api/auth/login` (or registers via `POST /api/auth/register`), Budget App proxies the credentials to Control Plane (`/api/auth/login`).
   - Upon receiving Control Plane's JWT (`token` / `access_token`), Budget App verifies the signature, issuer (`https://auth.printprice.pro`), and audience (`ppos:control`) using `jwt.verify(rawToken, BPE_JWT_SECRET, ...)`.
   - It extracts the authoritative `sub` (`userId`), `email`, `role`, `tenant_id` (`tenantId`), `printhouse_id`, and `jti`, issues/reads the HTTP-only signed cookie `pp_session_id`, and binds `{ id, email, role, tenantId, printhouseId, jti, boundAt }` in the server-side `sessionVault`.
2. **Session Introspection & Logout (`GET /api/auth/session` & `POST /api/auth/logout`)**:
   - `GET /api/auth/session` resolves the signed `pp_session_id` cookie against `sessionVault` (or verifies a direct `Authorization: Bearer` JWT) and returns the authenticated user and `tenant_id` so page reloads preserve the tester's tenant session.
   - `POST /api/auth/logout` removes the session's bound identity from `sessionVault`.
3. **Request Identity & Tenant Verification (`resolveRequestIdentity` & `resolveSpineBffTenantContext`)**:
   - `resolveRequestIdentity(req)`:
     - If an `Authorization: Bearer <token>` header is present (and is not `ADMIN_API_TOKEN`), verifies it with `jwt.verify`. If tampered, expired, or signed with an unknown secret, marks `authError = 'INVALID_TOKEN'`.
     - Otherwise looks up `req.signedCookies['pp_session_id']` in `sessionVault`.
   - `resolveSpineBffTenantContext(req, res)`:
     - Rejects `authError === 'INVALID_TOKEN'` with `401 UNAUTHORIZED`.
     - Rejects sessions without a verified `tenantId` with `403 TENANT_CONTEXT_REQUIRED`.
     - Rejects any mismatch between `identity.tenantId` and client-supplied `req.body.tenantId`, `req.query.tenantId`, or `req.headers['x-tenant-id']` with `403 FORBIDDEN_TENANT_MISMATCH`.
     - When `externalOrderIntentId` or `canonicalOrderId` is supplied, checks `repositories.orderIntents.getById(orderRef)` via `assertOrderIntentAccess(req, intent)` and verifies `intent.tenant_id === identity.tenantId`; rejects cross-tenant or unauthorized order access with `403 FORBIDDEN_TENANT_MISMATCH`.
4. **Scoped Delegated Service Token (`buildSpineControlPlaneHeaders`)**:
   - Signs a short-lived (60s) delegated JWT containing:
     ```json
     {
       "sub": "bpe-system-user",
       "role": "SYSTEM",
       "bff_delegated": true,
       "tenant_id": "<verified_session_tenant_id>",
       "printhouse_id": "<verified_printhouse_id>",
       "delegated_user_id": "<verified_user_id>",
       "delegated_session_id": "<signed_pp_session_id>",
       "delegated_order_id": "<verified_order_id_or_null>"
     }
     ```
   - Strips any client-supplied `tenantId` / `tenant_id` from the request body before forwarding to Control Plane.

### 3.2 Control Plane (`server.js`, `src/api/middleware/auth.js`, `src/api/routes/spineRoutes.js`, `src/api/services/spine/spineCalculationService.js`)

1. **JWT Claims Extraction (`server.js` & `src/api/middleware/auth.js`)**:
   - Both Fastify's `onRequest` hook (`server.js`) and Express `requireAdmin` (`src/api/middleware/auth.js`) extract `bffDelegated` (`Boolean(decoded.bff_delegated)`), `delegatedUserId`, `delegatedSessionId`, and `delegatedOrderId` into `req.user` (`request.user`).
2. **Delegated Service Credential Verification (`resolveTrustedTenant` in `src/api/routes/spineRoutes.js`)**:
   - Now `async`:
   - If the caller is `bpe-system-user` / `SYSTEM` / `bffDelegated`:
     - Requires `bff_delegated === true` and (`delegated_user_id` + `delegated_session_id` OR `delegated_order_id`); otherwise returns `403 TENANT_CONTEXT_REQUIRED`.
     - Queries `control_users` (and `users` fallback) by `delegated_user_id` and verifies `String(dbUser.tenant_id) === String(tenantId)`. If the delegated user belongs to a different tenant, returns `403 FORBIDDEN_TENANT_MISMATCH`.
3. **Order Ownership / Tenant Verification (`verifyOrderBelongsToTenant` in `src/api/services/spine/spineCalculationService.js`)**:
   - Before calculating or persisting a snapshot, checks `spine_calculation_snapshots` and `orders` for any existing record matching `externalOrderIntentId` or `canonicalOrderId`.
   - If the order belongs to a different `tenant_id`, throws `SpineCalculationError('...', 'FORBIDDEN_TENANT_MISMATCH', 403)`.

### 3.3 Budget App Frontend (`lib/spineApi.ts`, `components/UserMenu.tsx`, `components/BookSpineGeometryPanel.tsx`, `App.tsx`)

- `lib/spineApi.ts`: Includes `credentials: 'include'` on `fetch('/api/budget/spine/calculate')` and `fetch('/api/budget/spine/profiles')` so the browser always sends the signed `pp_session_id` cookie.
- `components/UserMenu.tsx`: Includes `credentials: 'include'` on `/api/auth/login` and `/api/auth/register` and captures `tenant_id` on `AuthUser`.
- `App.tsx` & `components/BookSpineGeometryPanel.tsx`: Hydrates the authenticated session on mount via `GET /api/auth/session` and passes `authContextKey` (`${user?.user_id || 'anon'}:${user?.tenant_id || 'no-tenant'}`) to `BookSpineGeometryPanel` so logging in or switching accounts immediately refreshes profiles and recalculates Spine geometry under the authenticated tenant.

---

## 4. Automated Security & Multi-Tenant Test Coverage

| Test Suite | Scenario | Expected & Verified Result |
| :--- | :--- | :--- |
| `tests/spine02_03_engine_and_api.test.js` (`5.9`) | Global service credential (`bpe-system-user`) without `bff_delegated` / `delegated_user_id` | `403 TENANT_CONTEXT_REQUIRED` |
| `tests/spine02_03_engine_and_api.test.js` (`5.9`) | Delegated BFF token where `delegated_user_id` (`usr_alpha_1`) belongs to `tenant_alpha`, but token claims `tenant_beta` | `403 FORBIDDEN_TENANT_MISMATCH` |
| `tests/spine02_03_engine_and_api.test.js` (`5.9`) | Valid delegated BFF token for `tenant_alpha` (`usr_alpha_1` + `sess_alpha_001`) | `201 Created` (`spineWidthMm: 10.5`) |
| `tests/spine02_03_engine_and_api.test.js` (`5.9`) | Cross-tenant `externalOrderIntentId` (`oi_alpha_shared_check` owned by `tenant_alpha`, called by `tenant_beta`) | `403 FORBIDDEN_TENANT_MISMATCH` |
| `tests/spine02_03_engine_and_api.test.js` (`5.9`) | Cross-tenant `canonicalOrderId` (`ord_alpha_999` owned by `tenant_alpha`, called by `tenant_beta`) | `403 FORBIDDEN_TENANT_MISMATCH` |
| `server/scripts/test_spine_04_integration.js` (`10/10`) | Unauthenticated call to `/api/budget/spine/calculate` and `/api/budget/spine/profiles` | `403 TENANT_CONTEXT_REQUIRED` |
| `server/scripts/test_spine_04_integration.js` (`10/10`) | Manipulated / forged Bearer JWT signed with attacker secret | `401 UNAUTHORIZED` |
| `server/scripts/test_spine_04_integration.js` (`10/10`) | Two distinct tenants (`tenant_alpha` and `tenant_beta`) logged in via `/api/auth/login` | Isolated `pp_session_id` cookies & `sessionVault` bindings |
| `server/scripts/test_spine_04_integration.js` (`10/10`) | Client spoofing `tenantId: 'tenant_alpha'` in body or `x-tenant-id` header while authenticated as `tenant_beta` | `403 FORBIDDEN_TENANT_MISMATCH` |
| `server/scripts/test_spine_04_integration.js` (`10/10`) | Cross-tenant `GET /api/budget/spine/calculations/:id` and cross-tenant `externalOrderIntentId` | `403 FORBIDDEN_TENANT_MISMATCH` |

