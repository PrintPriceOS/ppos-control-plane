# Phase 122 — Internal Order Lifecycle Pilot

## Scope

Phase 122 implements a controlled internal order lifecycle pilot for `ppos-control-plane`. It validates the operational order lifecycle from controlled intake to production-readiness evidence using internal/test tenants only.

## Prerequisites

- Phase 120.1 — Migration Integrity & Acceptance Env Repair: VALIDATED
- Phase 121 — Controlled Production Pilot Activation Gate: VALIDATED

## Safety Constraints

The following remain disabled at all times:

- FULL_PUBLIC
- OPEN_MARKETPLACE_ACCESS
- UNRESTRICTED_LIVE_PROVIDER_CONNECTIVITY
- PAYMENT_EXECUTION
- REFUND_EXECUTION
- PAYOUT_EXECUTION
- EXTERNAL_TAX_SUBMISSION
- EXTERNAL_ACCOUNTING_SUBMISSION
- PROVIDER_EXTERNAL_SUBMISSION
- SOURCE_RECORD_MUTATION_OUTSIDE_PILOT_SCOPE

No real payments, refunds, payouts, tax submissions, accounting submissions, or provider submissions are executed. Pilot source records are isolated from commercial production records.

## Schema

Migration: `migrations/064_phase122_internal_order_lifecycle_pilot.sql`

Tables:
- `internal_order_lifecycle_pilot_runs` — Pilot run tracking with safety flags
- `internal_order_lifecycle_pilot_orders` — Internal pilot order records
- `internal_order_lifecycle_pilot_steps` — Lifecycle step checklist
- `internal_order_lifecycle_pilot_findings` — Blocker and non-blocker findings
- `internal_order_lifecycle_pilot_audits` — Audit trail for all lifecycle events
- `internal_order_lifecycle_pilot_rollback_points` — Rollback simulation records
- `internal_order_lifecycle_pilot_evidence_packs` — Evidence pack storage

## Service Methods

File: `src/api/services/internalOrderLifecyclePilotService.js`

- `createPilotLifecycleRun(payload)` — Create a new pilot lifecycle run
- `evaluatePilotLifecycleReadiness(payload)` — Evaluate readiness for internal order
- `createInternalPilotOrder(payload)` — Create an internal pilot order
- `executeInternalOrderLifecycle(payload)` — Execute the governed lifecycle
- `createRollbackPoint(payload)` — Create a rollback simulation point
- `simulateLifecycleRollback(payload)` — Simulate lifecycle rollback
- `recordLifecycleFinding(payload)` — Record a lifecycle finding
- `resolveLifecycleFinding(payload)` — Resolve a lifecycle finding
- `listLifecycleSteps(payload)` — List lifecycle steps
- `getLifecycleAuditTimeline(payload)` — Get audit timeline
- `buildInternalOrderLifecycleEvidencePack(payload)` — Build evidence pack

## Admin API Endpoints

Mount: `/api/admin/production/internal-order-lifecycle-pilot`

| Method | Path | Description |
|--------|------|-------------|
| GET | /readiness | Evaluate lifecycle readiness |
| POST | /create-run | Create pilot lifecycle run |
| POST | /create-order | Create internal pilot order |
| POST | /execute-lifecycle | Execute internal order lifecycle |
| POST | /rollback-point | Create rollback point |
| POST | /simulate-rollback | Simulate lifecycle rollback |
| POST | /finding | Record lifecycle finding |
| POST | /resolve-finding | Resolve lifecycle finding |
| GET | /steps | List lifecycle steps |
| GET | /audit-timeline | Get audit timeline |
| GET | /evidence-pack | Build evidence pack |

## UI Route

`/admin/production/internal-order-lifecycle-pilot`

Page: `src/ui/pages/production/InternalOrderLifecyclePilot.tsx`

## Lifecycle Steps

1. PILOT_TENANT_ALLOWLIST_VERIFIED
2. INTERNAL_ORDER_INTAKE_CREATED
3. PRICING_SNAPSHOT_REFERENCED
4. FILE_PACKAGE_REFERENCED
5. PREFLIGHT_READINESS_REFERENCED
6. INVOICE_READINESS_REFERENCED
7. PRODUCTION_READINESS_REFERENCED
8. PAYMENT_EXECUTION_BLOCK_VERIFIED
9. PROVIDER_EXTERNAL_SUBMISSION_BLOCK_VERIFIED
10. SOURCE_MUTATION_BOUNDARY_VERIFIED
11. AUDIT_TIMELINE_BUILT
12. EVIDENCE_PACK_BUILT
13. ROLLBACK_POINT_CREATED
14. ROLLBACK_SIMULATED

## Rollback Simulation

Rollback is simulated only. `rollback_simulated_only` defaults to `true`, `rollback_executed` defaults to `false`. No real rollback is performed against production source records.

## Evidence Pack

The evidence pack includes: pilot run ID, pilot order ID, tenant ID, lifecycle status, readiness summary, step summary, finding summary, audit summary, rollback point summary, safety invariants, and a redacted preview.

## Validation Commands

```bash
node --check src/api/services/internalOrderLifecyclePilotService.js
node --check src/api/routes/internalOrderLifecyclePilotAdmin.js
node --check scripts/smoke_phase122a_internal_order_lifecycle_pilot_schema.js
node --check scripts/smoke_phase122b_internal_order_lifecycle_pilot_service.js
node --check scripts/smoke_phase122c_internal_order_lifecycle_pilot_admin_api_ui.js
node --check scripts/smoke_phase122d_internal_order_lifecycle_pilot_e2e_regression.js
node --check scripts/smoke_phase122e_internal_order_lifecycle_pilot_acceptance_pack.js

node scripts/smoke_phase122a_internal_order_lifecycle_pilot_schema.js
node scripts/smoke_phase122b_internal_order_lifecycle_pilot_service.js
node scripts/smoke_phase122c_internal_order_lifecycle_pilot_admin_api_ui.js
node scripts/smoke_phase122d_internal_order_lifecycle_pilot_e2e_regression.js
node scripts/smoke_phase122e_internal_order_lifecycle_pilot_acceptance_pack.js
npm run build
```

## Final Acceptance Status

Phase 122 is VALIDATED when all smoke tests pass, npm run build succeeds, and the final output confirms all safety flags remain NOT_ENABLED.
