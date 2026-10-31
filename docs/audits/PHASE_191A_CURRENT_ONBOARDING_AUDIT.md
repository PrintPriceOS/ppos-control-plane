# Phase 191A — Current Onboarding Architecture Audit

## 1. Executive Summary
The current Printhouse onboarding flow is built as a single 7-step monolithic wizard (`PrinthouseRegistrationPage.tsx`) backed by a single transactional backend operation (`printhouseService.selfRegister()`). It forces prospective printing partners to provide identity, legal, geographic, machinery fleet, format/dimensional, volume, pricing, integration, and administrative security credentials before ever accessing the system.

## 2. Audit Findings & Answers to Core Questions

### Q1-Q3: Collected Fields & Categorization
The current public registration wizard collects:
* **Identity Critical:** Email, Password, Contact Person Name.
* **Account Critical:** Company Name, Country, City, Phone, Website.
* **Operational:** Machinery presses (manufacturer, model, quantity, dimensions, sheet limits), production types (Offset, Digital, Large Format, Packaging, Binding), quality assurance modules.
* **Commercial / Pricing:** Selected Plan (`STARTER`, `GROWTH`, `ENTERPRISE`), Billing Interval (`monthly`, `annual`), Budgeter Priority.
* **Marketplace / Readiness:** B2B certifications (ISO 12647, FOGRA, FSC), ISO quality standards.
* **Integrations:** Integration Level (`Dashboard Only`, `API-ready`, `Fully automated routing`), Webhook provisioning intent, JDF/JMF orchestration.

### Q4-Q7: Backend Registration Behavior (`selfRegister`)
* **Records Created in Single Transaction:**
  1. `tenants` (ID: `ph-xxxxxxxx`, status: `ACTIVE`, plan: selectedPlan, metadata: B2B qualification JSON).
  2. `printer_nodes` (ID: `node-xxxxxxxx`, status: `pending_review`, marketplace_enabled: `false`, scope: `private`).
  3. `printhouse_capabilities` (Initial row with country support).
  4. `control_users` (Role: `PRINTHOUSE_ADMIN`, password hashed with bcrypt cost factor 12).
  5. `tenant_licenses` (License type: `PRINTER_OPERATIONS`, status: `ACTIVE`).
  6. Machinery fleet records inserted into canonical machine tables if press templates are provided.
* **Atomicity & Failures:**
  * Tenant, printer node, capabilities, user, and license creation run inside a MySQL transaction (`connection.beginTransaction()`).
  * **Accidental Non-Blocking Failure:** Machinery auto-seeding is wrapped in a `try/catch` block within `selfRegister` (lines 155-157 of `printhouseService.js`). If template seeding fails, the error is swallowed/logged, and registration succeeds anyway without seeding machines.

### Q8-Q10: Authentication, Uniqueness & Tokens
* **Auto-Login Issue:** `POST /api/auth/printhouse/register` immediately issues a signed JWT upon `selfRegister` completion **before** verifying the user's email address.
* **Duplicate Signup Handling:** If an email already exists in `control_users`, `printhouseService.selfRegister` throws an error (`User with this email already exists`). However, no unverified pending request concept exists, creating potential partial duplicate attempts.
* **Uniqueness Constraints:** `control_users.email` has a unique constraint. `tenants.id` and `printer_nodes.id` are generated with UUID prefix.

### Q11-L13: Email Delivery & Google OAuth Status
* **Email Delivery:** Currently, no production email delivery service (SMTP/SES/Resend/Postmark) is wired. `forgot-password` and `adminProvision` merely log links/messages to the node console (`[AUTH-FORGOT-PW] Reset link for ...`).
* **Google OAuth:** Zero Google OAuth or Google Identity Services integration exists anywhere in the codebase.
* **Session/Cookie Model:** Pure Bearer JWT sent via standard `Authorization: Bearer <token>` HTTP header.

### Q14-Q15: Route Guards & Printhouse Status Semantics
* **Status Conflict:**
  * `tenants.status` is set to `ACTIVE`.
  * `printer_nodes.status` is set to `pending_review`.
* **Dashboard Blocking Issue:** All endpoints under `/api/printhouse/dashboard/*` enforce `requireApprovedPrinthouse` middleware. This middleware explicitly rejects any `printer_node` whose status is not `active` with HTTP `403 ACCOUNT_NOT_ACTIVE`.
* **Result:** A newly self-registered Printhouse receives a valid JWT, but as soon as they land on the dashboard, API calls fail with 403 because `printer_nodes.status` is `pending_review`.

### Q16-Q20: Component Extraction & Backward Compatibility
* UI components in `PrinthouseRegistrationPage.tsx` (country selector, machine template picker, dimension inputs, capability checkboxes, plan selection cards) are modular enough to be extracted into progressive setup cards inside the dashboard.
* The existing `/api/auth/printhouse/register` endpoint and admin provisioning workflow in `PrinthouseOnboardingPage.tsx` must be preserved for admin-assisted partner onboarding.
