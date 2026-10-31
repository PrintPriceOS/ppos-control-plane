# Phase 191D: Security Acceptance

## 1. Goal
Evaluate authorization controls, tenant boundaries, and input safety mechanisms across the Machinery and Onboarding domains.

---

## 2. Security Control Findings

### 2.1 Route Authentication and Role Check
- **Access Hook**: All routes mounted under `/api/printhouse/onboarding` are protected by a global onRequest JWT verification hook in `server.js`.
- **Role restrictions**: `requireAuth` in `printhouseMachinesRoutes.js` explicitly blocks users with roles other than `PRINTHOUSE_ADMIN` or `SUPER_ADMIN` with `403 Forbidden`.
- **Suspension check**: Suspended tenants are blocked from API interactions via database check on tenant status in the route middleware.

### 2.2 Strict Tenant Boundary Isolation
- **Resource Scoping**: CRUD operations require matching `tenantId` (derived from validated JWT) and `siteId` (verified against `printer_nodes` ownership).
- **Safe 403 / 404 responses**: Access attempts to sites or machines owned by a different tenant are rejected with safe HTTP responses, leaking no metadata.

### 2.3 Payload Validation and Field Protection
- **FIELD_NOT_EDITABLE (HTTP 400)**: Silent stripping is replaced with explicit rejection when attempting to mutate protected fields (such as `id`, `tenant_id`, `printhouse_id`, `approved`, etc.) to prevent privilege escalation.
