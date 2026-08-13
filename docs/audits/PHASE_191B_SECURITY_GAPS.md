# Phase 191B.1 — Security Gaps & Runtime Assessment Report

## 1. Documented Gaps & Status

### A. Production Email Provider Status
* **Current Status:** `PRODUCTION_EMAIL_DELIVERY: NOT VERIFIED`
* **Details:** `emailDeliveryService.js` provides a provider-neutral abstraction layer with `DEV_LOGGER` active by default. AWS SES, Resend, or SMTP Nodemailer providers are outlined as extension points for production deployment.

### B. Rate Limiting Architecture
* **Current Status:** `HORIZONTAL_RATE_LIMIT_GUARANTEE: NOT PROVEN`
* **Details:** `authRateLimiter` in `authRoutes.js` uses an in-memory `Map` per Node process. In multi-instance horizontally scaled deployments behind a load balancer, a Redis-backed rate limiter (e.g. `ioredis` / `express-rate-limit`) should be enabled to guarantee cross-node rate enforcement.

### C. Referrer Leakage Mitigation
* **Current Status:** `VERIFIED & MITIGATED`
* **Details:** `PrinthouseActivationPage.tsx` automatically invokes `window.history.replaceState({}, document.title, window.location.pathname)` immediately after inspecting the activation token. This strips raw token parameters from the browser address bar, preventing token leaks to external third-party referrer headers.

### D. Frontend Feature Flag Naming
* **Current Status:** `VERIFIED & MITIGATED`
* **Details:** `PrinthouseRegistrationPage.tsx` checks `import.meta.env.VITE_PRINTHOUSE_MINIMAL_SIGNUP_ENABLED` in accordance with Vite bundler conventions.
