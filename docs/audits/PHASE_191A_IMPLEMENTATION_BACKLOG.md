# Phase 191A — Implementation Backlog & Phased Roadmap

## Implementation Backlog (Phases 191B - 191H)

### Phase 191B — Minimal Email Registration & Activation Token Infrastructure
* **Scope:**
  * Add additive DB migration `printhouse_signup_requests`.
  * Create `printhouseIdentityService.js` and `printhouseActivationService.js`.
  * Add routes: `POST /api/auth/printhouse/start`, `POST /api/auth/printhouse/resend-activation`, `POST /api/auth/printhouse/activate`.
  * Implement email delivery service abstraction (`emailDeliveryService.js`).
* **Verification:** Unit tests for token hashing, expiration, idempotency, and anti-enumeration responses.

### Phase 191C — Deferred Activation & Workspace Provisioning
* **Scope:**
  * Modify activation consumption to atomically create user, tenant (status `PENDING_EMAIL_VERIFICATION` -> `ACTIVE`), and printer node (status `DRAFT`).
  * Issue JWT token only upon successful activation.
* **Verification:** E2E test verifying JWT is issued only after activation token redemption.

### Phase 191D — Google Authentication & OAuth Integration
* **Scope:**
  * Create `googleIdentityService.js` to validate Google ID tokens.
  * Add routes: `POST /api/auth/google`.
  * Auto-provision active tenant and user when Google email is verified.

### Phase 191E — Printhouse Setup Hub UI
* **Scope:**
  * Create `src/ui/pages/printhouse/PrinthouseSetupHub.tsx`.
  * Extract setup cards (`CompanyProfileSetupCard`, `MachineSetupWizard`, `CapabilitySetupCard`, `PricingSetupWizard`, `IntegrationSetupCard`).
  * Add route `/printhouse/setup-hub` in `App.tsx`.

### Phase 191F — Backend Readiness Engine & Feature Gating
* **Scope:**
  * Add `onboardingReadinessService.js` and `printhouse_onboarding_profiles` table.
  * Add `GET /api/printhouse/onboarding/readiness`.
  * Adjust `requireApprovedPrinthouse` middleware to allow setup hub access while protecting live job dispatch.

### Phase 191G — Compatibility Migration & Route Cutover
* **Scope:**
  * Redirect public `/printhouse/register` to minimal signup component.
  * Preserve `/admin/printhouse-onboarding/new` for admin-assisted provisioning.

### Phase 191H — Acceptance Pack & Hardening
* **Scope:** Full non-regression suite, security audit, stress test on token concurrency.
