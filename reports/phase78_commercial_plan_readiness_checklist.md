# Phase 78 — Commercial Plan Readiness Checklist
**PrintPrice OS Control Plane — Usage, Billing & Plan Limits Launch Checklist**

Use this checklist to verify that a tenant commercial entitlement, usage metering, and billing event governance system is fully operational and compliant before commercial pilot or public rollout.

---

## Part A: Commercial Plans & Entitlements Schema
- [x] **A1: Seed Commercial Plans table populated**
  - Standard plans (FREE, PRO, BUSINESS, ENTERPRISE, PILOT, SYSTEM, CUSTOM, FOUNDING_PRINTHOUSE) seeded in `commercial_plans`.
- [x] **A2: Tenant Entitlements matrix populated**
  - Tenant assignments tracked in `tenant_commercial_entitlements` with active period keys.
- [x] **A3: Legacy schema compatibility preserved**
  - Integration synchronizes with legacy `tenant_resource_limits`, `tenant_resource_overrides`, `tenant_usage_stats`, and `preflight_tenant_quotas`.
- [x] **A4: Custom limit overrides respected**
  - Entitlements respect `custom_limits_json` configuration overrides over base plan limits.
- [x] **A5: System plan bypass rules validated**
  - SYSTEM plan tenants bypass billing/quota limits but NEVER bypass artifact_trust, preflight validation, machine assignment gates, or production handoff.

---

## Part B: Usage Metering & Idempotency
- [x] **B1: Idempotency protection enabled on usage events**
  - Duplicate usage events sharing `resource_id` + `event_type` are detected and ignored on retry.
- [x] **B2: Basic job usage event logging active**
  - Events logged for order creations, file uploads, preflight jobs, and machine assignments.
- [x] **B3: Custom quantity event logging supported**
  - Events can record variable quantities (e.g. 10 API requests, multiple file downloads).
- [x] **B4: Monthly usage counters auto-increment**
  - Counter metrics in `tenant_usage_counters` update in real-time upon recording usage events.
- [x] **B5: Storage snapshot calculation active**
  - Direct updates capture tenant storage usage from preflight active artifacts.

---

## Part C: Quota Enforcement & Overage Policy
- [x] **C1: Action-specific limits evaluated**
  - Limits asserted for orders count, daily job limits, storage usage, and export actions.
- [x] **C2: Soft limit warnings triggered**
  - Tenants with overage-enabled plans generate warnings and record overage flags upon exceeding limits.
- [x] **C3: Hard limit blocks enforced on FREE tier**
  - FREE plan tenants are blocked immediately at their limits with no overage fee accrue.
- [x] **C4: Overage rates evaluated correctly**
  - Overage rates applied correctly based on tier (€0.10 per job and €0.50 per GB of storage).
- [x] **C5: Billing run event logs persisted**
  - Persisted events write logs for `OVERAGE_RECORDED`, `LIMIT_WARNING`, and `HARD_LIMIT_BLOCK`.

---

## Part D: Administration & Compliance Guardrails
- [x] **D1: Role-based admin controls enforced**
  - Plan assignment, billing status updates, and manual adjustments restricted to SUPER_ADMIN or OPS_ADMIN.
- [x] **D2: Manual adjustments applied to summaries**
  - Admin adjustments recorded in `billing_events` and applied correctly to billing summaries.
- [x] **D3: Customer safe error message sanitization**
  - Customer warning sanitizes internal DB/path details, while admins receive detailed logs.
- [x] **D4: React billing dashboard UI integrated**
  - Frontend components render plans, entitlements, usage counters, quota decisions, events timeline, and overage summaries.
- [x] **D5: Sidebar menu registration active**
  - Route `/admin/billing-usage` is accessible to authorized operators under the sidebar configuration.
