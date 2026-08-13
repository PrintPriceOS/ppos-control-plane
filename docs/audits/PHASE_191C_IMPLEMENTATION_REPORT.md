# Phase 191C — Implementation Report

## 1. Implementation Summary
Phase 191C establishes the authenticated **Printhouse Setup Hub** (`/printhouse/setup`) and implements the initial two onboarding modules: **Company Profile** and **Production Sites**.

## 2. Verdict
```text
PHASE_191C_ACCEPTANCE: PASS
IS_PRINTER_NODE_THE_CANONICAL_PRODUCTION_SITE: YES
```

## 3. Files Created & Modified
* `migrations/138_phase191c_printhouse_onboarding_profiles.sql` — Additive UX progress metadata table.
* `src/api/services/printhouseReadinessService.js` — Backend readiness calculation engine with stable reason codes.
* `src/api/services/printhouseOnboardingService.js` — Canonical CRUD for Company Profile and Production Sites with placeholder node reuse.
* `src/api/routes/printhouseOnboardingRoutes.js` — Scoped onboarding endpoints under `/api/printhouse/onboarding/*`.
* `src/api/routes/admin.js` — Registered `/printhouse/onboarding` sub-router.
* `src/ui/components/printhouse/setup/FieldGuidance.tsx` — Operational field guidance tooltip component.
* `src/ui/components/printhouse/setup/SetupProgressSummary.tsx` — Readiness area progress summary cards.
* `src/ui/components/printhouse/setup/SetupModuleCard.tsx` — Onboarding module status card.
* `src/ui/components/printhouse/setup/CompanyProfileForm.tsx` — Company Profile form component.
* `src/ui/components/printhouse/setup/ProductionSitesPanel.tsx` — Production Sites management panel.
* `src/ui/pages/printhouse/PrinthouseSetupHub.tsx` — Authenticated Setup Hub landing page.
* `src/ui/App.tsx` — Added `/printhouse/setup` route.
* `scripts/smoke_phase191c_setup_hub.js` — Automated integration & tenant-isolation test script.

## 4. Verification Evidence
* **Vite Production Build:** Executed `npm run build` — `✓ built in 11.71s` with 0 errors.
* **Tenant Isolation:** Verified via test script `scripts/smoke_phase191c_setup_hub.js` (Cross-tenant mutations rejected cleanly with `SITE_NOT_FOUND`).
* **Node Duplication Defense:** Primary site creation reuses and completes activation draft placeholder node without duplicating nodes.
