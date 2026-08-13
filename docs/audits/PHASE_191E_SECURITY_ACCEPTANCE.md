# Phase 191E: Security Acceptance

## 1. Goal
Validate authorization controls, tenant boundary checks, and payload protection filters applied across the Materials, Capacity, and Lead Times REST endpoints.

---

## 2. Security Control Findings

### 2.1 Route Authentication and Role Check
- **Gating Middleware**: All endpoints mounted under `printhouseOnboardingRoutes.js` are protected by a global `requireAuth` middleware.
- **Allowed Roles**: Restricts access strictly to users with roles `PRINTHOUSE_ADMIN` or `SUPER_ADMIN`.
- **Tenant status check**: Rejects any request if the associated tenant status in the database is `SUSPENDED` or `DELETED`, returning `403 Forbidden`.

### 2.2 Strict Tenant Boundary Isolation
- **Resource Scoping**: CRUD actions check that the target physical site (`siteId` route parameter) is owned by the current tenant (retrieved from the authenticated JWT token). Accessing foreign sites is rejected with `403 Forbidden` (no metadata leak).
- **Composite Key constraints**: Multi-column foreign keys natively reject mismatched database inserts.

### 2.3 Payload Validation (Financial / Activation Fields Rejection)
- **Rejection Policy**: POST or PUT payloads containing cost details or pricing models (like `cost_per_unit`, `pricing`, `markup`) or activation flags (like `approved`, `routing_enabled`, `production_enabled`) are explicitly rejected.
- **Error details**: Returns `400 Bad Request` with error code `FIELD_NOT_EDITABLE` and the safe list of offending fields.
