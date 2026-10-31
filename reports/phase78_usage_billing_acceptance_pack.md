# Phase 78 — Usage & Billing Acceptance Pack
**PrintPrice OS Control Plane — Commercial Plan & Usage Limits Acceptance Pack**

This acceptance pack documents the plan limits, quota enforcement rules, overage calculation logic, and wording compliance restrictions implemented for commercial usage control in PrintPrice OS.

---

## 1. Executive Summary

- **Commercial Target Plan**: Seeded plans configured (FREE, PRO, BUSINESS, ENTERPRISE, PILOT, SYSTEM, CUSTOM).
- **Core Enforcement Principle**: Quotas restrict platform resource usage based on tier and active entitlements.
- **External Dependencies**: Zero. No integration with external credit card processors, bank gateways, or external billing systems.
- **Aesthetics & Wording Compliance**: Strictly internal wording only. Avoid common terms for external billing operations, commercial statements, sales levies, or external payout transactions in general client code and UI. All billing items are logged as "Billing Event Recorded" or "Internal Usage Record".

---

## 2. Plan Entitlements & Pricing Limits

The default constraints configured in the commercial plans registry are:

| Plan Code | Monthly Base Price | Included Preflight Jobs | Included Storage | Max File Size | Max Monthly Orders | Max Daily Jobs | Overage Rate |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FREE** | €0.00 | 5 jobs | 1 GB | 25 MB | 5 orders | 2 jobs | Blocked (No Overages) |
| **PRO** | €49.00 | 100 jobs | 20 GB | 100 MB | 100 orders | 20 jobs | €0.10/job, €0.50/GB |
| **BUSINESS** | €199.00 | 1,000 jobs | 100 GB | 500 MB | 1,000 orders | 200 jobs | €0.10/job, €0.50/GB |
| **ENTERPRISE** | €999.00 | Unlimited | 1,000 GB | 5,120 MB | Unlimited | Unlimited | €0.10/job, €0.50/GB |
| **PILOT** | €0.00 | 50 jobs | 10 GB | 250 MB | 15 orders | 10 jobs | Blocked (No Overages) |
| **SYSTEM** | €0.00 | Unlimited | Unlimited | 5,120 MB | Unlimited | Unlimited | Bypass (No Overages) |

---

## 3. Core Architectural Rules

### SYSTEM Tenant Bypass Gate
SYSTEM plan tenants may bypass billing and daily job limit checks in `quotaEnforcementService`. However, SYSTEM tenants are **never** permitted to bypass:
- Preflight validation check boundaries
- Artifact trust validations
- Machine compatibility profiles
- Proof/review approval gates
- Production handoff controls

### Idempotency Protection
To prevent duplicate usage increments during network retries or batch restarts, all events are logged through `usageMeteringService.recordUsageEvent` which enforces idempotency using unique `resource_id` + `event_type` checks. If an event is re-submitted, the database deduplicates it, returning the original event ID without incrementing counters.

### Cross-Tenant Isolation
Workspaces are strictly isolated. Custom queries, entitlement evaluations, monthly counters, and billing event summaries enforce tenant boundaries at the database parameter level, ensuring no cross-tenant information leaks or modifications can occur.

---

## 4. Acceptance Certification

This acceptance pack certifies that all commercial plan limits, billing overage systems, idempotency controls, and admin-only adjustment interfaces are fully implemented in code and validated via automated smoke testing.

**Authorized by**: `SYSTEM_ADMIN` (Control Plane Governance Board)
**Date**: 2026-06-11
