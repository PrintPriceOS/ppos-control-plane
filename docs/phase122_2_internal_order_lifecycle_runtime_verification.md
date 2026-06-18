# Phase 122.2 — Internal Order Lifecycle Runtime Verification / Restart Recovery Drill

## Status: VALIDATED

## Goal

Verify that Phase 122.1 survives real production operational conditions: PM2 restart, empty in-memory Maps, DB read-through, migration runner, and production acceptance checks.

## What This Phase Does

- Creates a runtime verification service with 6 verification check types
- Validates DB read-through recovery after simulated empty memory
- Validates audit timeline recovery from DB
- Validates evidence pack recovery from DB
- Validates tenant allowlist fail-closed behavior at runtime
- Validates blocker finding enforcement at runtime
- Produces a runtime verification evidence pack with integrity hash

## What This Phase Does NOT Do

- Does not execute any real PM2 or process restart from code
- Does not enable production activation
- Does not enable FULL_PUBLIC or open marketplace access
- Does not execute payments, refunds, or payouts
- Does not submit tax, accounting, or provider data externally
- Does not mutate source commercial records outside pilot scope

## Files Created

| File | Purpose |
|---|---|
| `migrations/066_phase122_2_internal_order_lifecycle_runtime_verification.sql` | DB tables for verification runs, checks, audits |
| `src/api/services/internalOrderLifecycleRuntimeVerificationService.js` | Runtime verification service with 10 methods |
| `src/api/routes/internalOrderLifecycleRuntimeVerificationAdmin.js` | Admin API with 10 endpoints |
| `src/ui/types/internalOrderLifecycleRuntimeVerification.ts` | TypeScript interfaces |
| `src/ui/api/internalOrderLifecycleRuntimeVerificationClient.ts` | Frontend API client |
| `src/ui/pages/production/InternalOrderLifecycleRuntimeVerification.tsx` | Admin UI page |
| `docs/phase122_2_runtime_restart_recovery_manual_drill.md` | Manual restart drill instructions |

## Files Modified

| File | Change |
|---|---|
| `src/api/routes/admin.js` | Import and mount at `/production/internal-order-lifecycle-runtime-verification` |
| `src/ui/App.tsx` | Import and route at `/admin/production/internal-order-lifecycle-runtime-verification` |

## API Endpoints

Mount: `/api/admin/production/internal-order-lifecycle-runtime-verification`

| Method | Path | Purpose |
|---|---|---|
| GET | `/readiness` | Check Phase 122.1 readiness and migration status |
| POST | `/create` | Create a runtime verification run |
| POST | `/verify-db-read-through` | Verify DB read-through works |
| POST | `/verify-memory-empty-recovery` | Verify recovery from empty memory |
| POST | `/verify-audit-recovery` | Verify audit timeline recovery from DB |
| POST | `/verify-evidence-recovery` | Verify evidence pack recovery from DB |
| POST | `/verify-allowlist` | Verify tenant allowlist fail-closed at runtime |
| POST | `/verify-blockers` | Verify blocker finding enforcement at runtime |
| GET | `/audit-timeline` | Get verification audit timeline |
| GET | `/evidence-pack` | Build runtime verification evidence pack |

## Safety Invariants

All of the following remain NOT_ENABLED / false throughout this phase:

- FULL_PUBLIC
- OPEN_MARKETPLACE_ACCESS
- LIVE_PROVIDER_CONNECTIVITY
- PAYMENT_EXECUTION
- REFUND_EXECUTION
- PAYOUT_EXECUTION
- EXTERNAL_TAX_SUBMISSION
- EXTERNAL_ACCOUNTING_SUBMISSION
- PROVIDER_EXTERNAL_SUBMISSION
- SOURCE_MUTATION_OUTSIDE_PILOT_SCOPE
- PRODUCTION_ACTIVATION
- SERVICE_RESTART_EXECUTED (no code restart)
- REAL_RESTART_EXECUTED (no code restart)

## Key Design Decisions

1. **No code restart:** All restart operations are manual and documented in the drill doc.
2. **Memory fallback not production valid:** `memory_fallback_production_valid` is always false.
3. **DB read-through verified:** Service attempts to recover data from DB when memory is empty.
4. **Evidence integrity:** Evidence pack includes SHA256 integrity hash.

## Smoke Tests

| Test | Purpose |
|---|---|
| `smoke_phase122_2a` | Schema: migration 066 tables, indexes, foreign keys, forbidden patterns |
| `smoke_phase122_2b` | Service: methods, safety markers, functional lifecycle smoke |
| `smoke_phase122_2c` | Admin API & UI: routes, types, client, page, App.tsx, drill doc |
| `smoke_phase122_2d` | Acceptance: full lifecycle, evidence pack, safety invariants, regression |
