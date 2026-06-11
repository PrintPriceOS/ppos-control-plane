# Phase 77 — Commercial Readiness Checklist
**PrintPrice OS Control Plane — Pilot Launch Checklist**

Use this checklist to verify that a tenant/printhouse pair is commercially ready for partner pilot operations.

---

## Part A: Onboarding & Capabilities

- [x] **A1: Onboarding status is set to `READY_FOR_PILOT`**
  - Verify that the printhouse profile is fully filled out and validated.
- [x] **A2: At least one active Machine exists**
  - Confirm that the printer machine fleet is registered and status is `ACTIVE`.
- [x] **A3: At least one active Media Catalog profile exists**
  - Verify that media/paper specifications (GSM, widths) are bound.
- [x] **A4: Policy Profiles are defined**
  - Validation rules (TAC limits, bleed, standards) are configured.
- [x] **A5: SLA Profiles are defined**
  - Delivery timelines, turnaround rules, and pricing bands are set.

---

## Part B: Access & Workspace Isolation

- [x] **B1: Tenant isolation mode is active**
  - Tenant is registered in the database with a non-null `isolation_mode` (e.g. `shared` or `isolated`).
- [x] **B2: Workspace separation assertions verified**
  - Shared data access rules are active. Attempts to access foreign orders, jobs, preflight files, or printhouse profiles throw `UNAUTHORIZED_TENANT_ACCESS`.
- [x] **B3: Error responses are sanitized**
  - Database error codes and physical paths are masked in API middleware. Cross-tenant exceptions return a generic `ACCESS_DENIED` with status `403`.
- [x] **B4: User roles are configured**
  - Ensure that operators and customers are scoped to their respective roles to prevent data exposure.

---

## Part C: Usage limits & Governance

- [x] **C1: Pilot limits are configured**
  - Max order limits, daily job limits, and file size limits are set.
- [x] **C2: Limit evaluation middleware is active**
  - Order intake checks limits; jobs count limits; storage checks quota.
- [x] **C3: Overriding checks are enforced**
  - Approvals for warning overrides or unsafe fixes are limited per day to prevent system abuse.
- [x] **C4: Limit exceedance audit logs are active**
  - Violations trigger `TENANT_PILOT_LIMIT_EXCEEDED` events in the audit log.

---

## Part D: Commercial Launch Gate

- [x] **D1: Live production is disabled**
  - Under Phase 77, `live_production_enabled` is locked to `0` and `commercial_status` is locked to `PILOT_ONLY`.
- [x] **D2: Blocker alerts display correctly**
  - Attempting to activate LIVE triggers a `LIVE_PRODUCTION_BLOCKED_BY_DESIGN` failure.
- [x] **D3: Audit logs capture activation requests**
  - Requests for live activation are permanently recorded in the API audit log database.
