# Phase 121 — Controlled Production Pilot Activation Gate

## Purpose

Create a controlled, tenant-scoped pilot activation layer for restricted internal or founding-printhouse tenants. This phase validates the production deployment in the real environment while keeping FULL_PUBLIC disabled and preventing uncontrolled live financial/provider execution.

## Prerequisites

- Phase 120 — Final Pre-Production Release Candidate: VALIDATED
- Phase 120.1 — Migration Integrity & Acceptance Env Repair: VALIDATED
- All acceptance packs 113G–120D: PASS
- npm run build: PASS

## Safety Invariants

- FULL_PUBLIC: NOT_ENABLED
- Open Marketplace: NOT_ENABLED
- Unrestricted Live Provider Connectivity: NOT_ENABLED
- Payment Execution: NOT_ENABLED (unless sandbox-only)
- Refund Execution: NOT_ENABLED (unless sandbox-only)
- Payout Execution: NOT_ENABLED (unless sandbox-only)
- External Submission: NOT_ENABLED
- Source Record Mutation: NOT_ENABLED (outside controlled pilot snapshots)
- All pilot actions: tenant-scoped, audited, reversible

## Artifacts

| File | Purpose |
|------|---------|
| `migrations/063_phase121_controlled_production_pilot_activation_gate.sql` | Schema for pilot runs, tenants, checks, findings, audits, rollback points |
| `src/api/services/controlledProductionPilotActivationService.js` | Service with 11 methods for pilot lifecycle management |
| `src/api/routes/controlledProductionPilotActivationAdmin.js` | Admin API mounted at `/api/admin/production/pilot-activation` |
| `src/ui/types/controlledProductionPilotActivation.ts` | TypeScript interfaces for pilot activation |
| `src/ui/api/controlledProductionPilotActivationClient.ts` | Frontend API client |
| `src/ui/pages/production/ControlledProductionPilotActivation.tsx` | UI page at `/admin/production/pilot-activation` |
| `scripts/smoke_phase121a_controlled_production_pilot_schema.js` | Schema smoke test |
| `scripts/smoke_phase121b_controlled_production_pilot_service.js` | Service smoke test |
| `scripts/smoke_phase121c_controlled_production_pilot_admin_api_ui.js` | Admin API & UI smoke test |
| `scripts/smoke_phase121d_controlled_production_pilot_acceptance_pack.js` | Full acceptance pack |

## Admin API Endpoints

Base: `/api/admin/production/pilot-activation`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/readiness` | Evaluate pilot readiness |
| POST | `/create` | Create pilot run |
| POST | `/register-tenant` | Register tenant for pilot |
| POST | `/activate-tenant` | Activate registered tenant |
| POST | `/suspend-tenant` | Suspend pilot tenant |
| POST | `/finding` | Record finding |
| POST | `/resolve-finding` | Resolve finding |
| POST | `/rollback-point` | Create rollback point |
| POST | `/simulate-rollback` | Simulate rollback |
| GET | `/audit-timeline` | View audit timeline |
| GET | `/evidence-pack` | Build evidence pack |

## Pilot Tenant Rules

- A tenant cannot be activated unless explicitly registered in `controlled_production_pilot_tenants`
- Unknown tenants are rejected with an error
- Tenant statuses: DRAFT → REGISTERED → READY_FOR_PILOT → PILOT_ACTIVE → PILOT_SUSPENDED → PILOT_COMPLETED
- Pilot run statuses: DRAFT → IN_REVIEW → READY_FOR_TENANT_ACTIVATION → ACTIVE_LIMITED_PILOT → SUSPENDED → COMPLETED

## Readiness Checks

1. Phase 120 VALIDATED
2. Phase 120.1 VALIDATED
3. Latest production build evidence present
4. Latest migrations applied
5. DB backup timestamp present
6. No unresolved blocker findings
7. Security/compliance evidence PASS
8. Incident readiness PASS
9. Rollback drill PASS
10. Pilot tenant explicitly allowlisted
11. FULL_PUBLIC remains false
12. External submissions remain false
13. Source mutation remains blocked
14. Payment execution remains disabled

## Validation Commands

```bash
node --check src/api/services/controlledProductionPilotActivationService.js
node --check src/api/routes/controlledProductionPilotActivationAdmin.js
node --check scripts/smoke_phase121a_controlled_production_pilot_schema.js
node --check scripts/smoke_phase121b_controlled_production_pilot_service.js
node --check scripts/smoke_phase121c_controlled_production_pilot_admin_api_ui.js
node --check scripts/smoke_phase121d_controlled_production_pilot_acceptance_pack.js

node scripts/smoke_phase121a_controlled_production_pilot_schema.js
node scripts/smoke_phase121b_controlled_production_pilot_service.js
node scripts/smoke_phase121c_controlled_production_pilot_admin_api_ui.js
node scripts/smoke_phase121d_controlled_production_pilot_acceptance_pack.js
npm run build
```
