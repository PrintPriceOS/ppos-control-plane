# Phase 191A — Backward Compatibility & Admin Provisioning Plan

## 1. Preservation of Existing Endpoints & Workflows
1. **Admin Provisioning Workflow:**
   * `/admin/printhouse-onboarding/new` using `PrinthouseRegistrationPage adminMode` will be preserved intact.
   * Internal admins need to provision fully pre-configured printing partners in a single step.
   * Backend endpoint `POST /api/printhouse/admin-provision` (or `printhouseService.adminProvision`) will remain active with immediate `active` status setting.
2. **Legacy Self-Register Route:**
   * `POST /api/auth/printhouse/register` will be maintained for a deprecation window or internally remapped to initiate the signup activation flow.

## 2. Mitigation for Route Guard Incompatibility
* Currently, `requireApprovedPrinthouse` in `src/api/middleware/auth.js` checks `if (node.status !== 'active')` and returns `403 ACCOUNT_NOT_ACTIVE`.
* **Fix for Progressive Onboarding:** Update `requireApprovedPrinthouse` or introduce `requireAuthenticatedTenant` so that users with `CONFIGURING` or `DRAFT` status can access dashboard onboarding endpoints (`/api/printhouse/onboarding/*`), while keeping sensitive dispatch routes gated by computed readiness.
