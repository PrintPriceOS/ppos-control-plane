# Phase 191B — Implementation Report

## 1. Scope Accomplished
Phase 191B has successfully replaced the mandatory 7-step public signup entry point with a minimal email signup flow and secure single-use activation infrastructure.

### Files Created
* `migrations/137_phase191b_printhouse_signup_requests.sql` — Additive schema for signup requests and hashed token lifecycle.
* `src/api/services/emailTemplates/printhouseActivationEmail.js` — HTML & text activation email templates.
* `src/api/services/emailDeliveryService.js` — Provider-agnostic email dispatch abstraction.
* `src/api/services/printhouseSignupService.js` — Anti-enumeration signup & resend service.
* `src/api/services/printhouseActivationService.js` — Non-consuming token inspection & atomic activation transaction.
* `src/ui/pages/PrinthouseActivationPage.tsx` — Scanner-resistant confirmation & activation UI.
* `scripts/smoke_phase191b_signup_activation.js` — Automated smoke test suite.
* `scripts/test_phase191b_logic.js` — Standalone unit test suite.

### Files Modified
* `src/api/routes/authRoutes.js` — Added `/printhouse/start`, `/resend-activation`, `/activation/inspect`, `/activate`.
* `src/api/middleware/auth.js` — Added `requirePrinthouseSetupAccess` to allow configuring accounts in `DRAFT`/`CONFIGURING`/`pending_review` access to setup-safe routes while keeping `requireApprovedPrinthouse` for live dispatch.
* `src/ui/pages/PrinthouseRegistrationPage.tsx` — Added minimal email signup view under feature flag `PRINTHOUSE_MINIMAL_SIGNUP_ENABLED`.
* `src/ui/App.tsx` — Added `/auth/activate` route.
