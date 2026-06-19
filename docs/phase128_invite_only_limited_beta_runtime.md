# Phase 128 — Invite-Only Limited Beta Runtime

## Goal & Description
Implement an invite-only limited beta runtime system that is DB-backed, restart-safe, fail-closed, and strictly validated. This allows selected cohorts of participants and tenants to execute runtime operations under tight safety invariants and boundary conditions.

## Safety Invariants & Governance
- **`FULL_PUBLIC`**: `NOT_ENABLED` (Always false/0)
- **`OPEN_MARKETPLACE`**: `NOT_ENABLED` (Always false/0)
- **`PAYMENT_EXECUTION`**: `NOT_ENABLED` (Always false/0)
- **`REFUND_EXECUTION`**: `NOT_ENABLED` (Always false/0)
- **`PAYOUT_EXECUTION`**: `NOT_ENABLED` (Always false/0)
- **`PROVIDER_EXTERNAL_SUBMISSION`**: `NOT_ENABLED` (Always false/0)
- **`TAX/ACCOUNTING_EXTERNAL_SUBMISSION`**: `NOT_ENABLED` (Always false/0)
- **`UNCONTROLLED_SOURCE_MUTATION`**: `NOT_ENABLED` (Always false/0)

These rules are enforced at the service level, admin routes, and in the schema via migration `074`.

> [!IMPORTANT]
> Phase 128 is not production-valid unless smoke_phase128a verifies migration 074, runtime tables, columns, indexes and safety defaults against the real DB.


## Schema Verification (Migration `074`)
The following 11 tables have been added:
1. `limited_beta_runtime_sessions`
2. `limited_beta_runtime_access_grants`
3. `limited_beta_runtime_access_denials`
4. `limited_beta_runtime_scope_policies`
5. `limited_beta_runtime_kill_switches`
6. `limited_beta_runtime_feature_flags`
7. `limited_beta_runtime_activity_logs`
8. `limited_beta_runtime_guardrail_events`
9. `limited_beta_runtime_rollback_events`
10. `limited_beta_runtime_findings`
11. `limited_beta_runtime_evidence_packs`

All columns enforce safety defaults (`TINYINT(1) DEFAULT 0` or `1` for kill_switch_enabled).

## Service Operations (`limitedBetaRuntimeService.js`)
Contains the implementation of 20 critical methods, including:
- Gate readiness evaluation (`evaluateRuntimeActivationReadiness`)
- Scope policy configuration (`createRuntimeScopePolicy` & `updateRuntimeScopePolicy`)
- Scoped access checks (`evaluateRuntimeAccess`)
- Active sessions and logs (`createRuntimeSession`, `terminateRuntimeSession`, `recordRuntimeActivity`, `recordRuntimeAccessDenial`, `recordRuntimeGuardrailEvent`)
- Emergency kill switch triggering & clearing (`triggerRuntimeKillSwitch`, `clearRuntimeKillSwitch`)
- DB-backed rollback tracking (`recordRuntimeRollbackEvent`)
- Finding management (`recordRuntimeFinding`, `resolveRuntimeFinding`)
- Version 128.0 evidence pack generation with SHA-256 integrity hash (`buildRuntimeEvidencePack`)

## Acceptance & Verification Results
All 7 smoke tests (`smoke_phase128a` through `smoke_phase128g`) pass successfully. The aggregator runs all tests in sequence, ensuring clean environment variables and configuration logic.
- Smoke 128a: Schema check PASS
- Smoke 128b: Service verification PASS
- Smoke 128c: Scoped eligibility and feature blocks PASS
- Smoke 128d: Emergency kill switch PASS
- Smoke 128e: Admin router mounts PASS
- Smoke 128f: Evidence pack & secret hygiene PASS
- Smoke 128g: Aggregation & builds compile PASS
