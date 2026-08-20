# PHASE 193D — Implementation & Runtime Guarantees Report
## Governed Calibration Acceptance & Immutable Pricing Revisions

> **Status**: **COMPLETE**
> **Classification**: **PASS**
> **Test Suite**: `smoke_phase193d_governed_acceptance.js` (**29 passed / 0 failed**)
> **Canonical BPE Dependency**: `@ppos/pricing-engine` (commit `8d324290d64b5bf17325ff1098db7ebb5f646b5d`)

---

## 1. Traceability Matrix: Original 40 Guarantees to Tests

| # | Guarantee Description | Type | Test ID | Result |
|---|---|---|---|---|
| 1 | Server-side acceptance handler requires authenticated tenant context | STATIC / RUNTIME | D1, D12b | PASS |
| 2 | Accept request payload accepts strictly `{ runId }` (rejects / neutralizes client rates/patches) | RUNTIME | D12e, D15 | PASS |
| 3 | Single database transaction executes atomic row-level locks (`SELECT ... FOR UPDATE`) | STATIC / RUNTIME | D1, D14 | PASS |
| 4 | Terminal state enforcement: Session in `ACCEPTED` rejects subsequent accept with 409 | RUNTIME | D9, D13 | PASS |
| 5 | Session status validation: Only `CALCULATED` sessions may be accepted | RUNTIME | D1, D14 | PASS |
| 6 | Calibration run validation: Only `SUCCEEDED` runs may be accepted | STATIC / RUNTIME | D1, D5 | PASS |
| 7 | Tenant isolation: Cross-tenant session/run acceptance rejected with 403/404 | RUNTIME | D17 | PASS |
| 8 | Printer node tenant isolation: Foreign printer node rejected with 403 | RUNTIME | D17 | PASS |
| 9 | Exact baseline drift detection: Current `rates_json` checksum compared to run baseline | RUNTIME | D6, D20 | PASS |
| 10 | Drift failure fail-closed: Aborts immediately with 409 `BASELINE_DRIFT_DETECTED` | RUNTIME | D20 | PASS |
| 11 | Proposed patch integrity check: Recomputed SHA-256 hash matches `proposed_patch_checksum` | RUNTIME | D2, D19 | PASS |
| 12 | Patch checksum tampering failure: Rejects with 500 `PROPOSED_PATCH_INTEGRITY_FAILURE` | RUNTIME | D19 | PASS |
| 13 | Active rate path governance: Verifies every leaf path in patch is in `active_rate_paths_json` | RUNTIME | D16 | PASS |
| 14 | Inactive path failure: Rejects proposal with 422 `INACTIVE_RATE_PATH_IN_PROPOSAL` | RUNTIME | D16 | PASS |
| 15 | Prototype pollution protection: `__proto__`, `constructor`, `prototype` keys discarded | RUNTIME | D4 | PASS |
| 16 | Safe deep merge: Preserves uncalibrated sibling rates and keys | RUNTIME | D4, D18 | PASS |
| 17 | Safe deep merge: Explicit numerical zeros (`0`) are preserved without resetting to default | RUNTIME | D4, D18 | PASS |
| 18 | Resulting rates checksum: Recursive key-sorted canonical SHA-256 computation | RUNTIME | D2, D22 | PASS |
| 19 | Forward BPE verification: Canonical `buildPrice(params, house)` invoked on merged rates | RUNTIME | D5 | PASS |
| 20 | Forward verification excludes transport/shipping from manufacturing residual calculation | RUNTIME | D5 | PASS |
| 21 | Governance tolerance policy: `max(absTolerance, targetPrice * pctTolerance)` | RUNTIME | D3, D21 | PASS |
| 22 | Governance tolerance failure: Rejects with 422 `CALIBRATION_ACCEPTANCE_TOLERANCE_EXCEEDED` | RUNTIME | D21 | PASS |
| 23 | Tolerance failure zero-mutation: Leaves `rates_json` and session status untouched on error | RUNTIME | D21 | PASS |
| 24 | Immutable revision insertion: `printhouse_pricing_revisions` record created | STATIC / RUNTIME | D0b, D22 | PASS |
| 25 | Revision record stores full post-merge `rates_json` document | RUNTIME | D22 | PASS |
| 26 | Revision record stores exact BPE package, version, and commit SHA provenance | STATIC / RUNTIME | D0b, D22 | PASS |
| 27 | Active node update: `printer_nodes.rates_json` updated in the same transaction | STATIC / RUNTIME | D14, D22 | PASS |
| 28 | Durable acceptance record: `printhouse_pricing_calibration_acceptances` record inserted | STATIC / RUNTIME | D0c, D11 | PASS |
| 29 | Acceptance record stores target, verified manufacturing price, residuals, and tolerances | STATIC | D0c | PASS |
| 30 | Acceptance record stores full verification debug & forward result decomposition | STATIC | D0c | PASS |
| 31 | Concurrency protection: `calibration_run_id` has `UNIQUE` database constraint | DB_CONSTRAINT | D0c, D11 | PASS |
| 32 | Concurrent double acceptance: Exactly 1 winner (`200 OK`) and 1 conflict (`409`) | RUNTIME | D13 | PASS |
| 33 | Transaction rollback: Injected failure after `rates_json` update restores original state | RUNTIME | D14 | PASS |
| 34 | Grants isolation: `printhouse_activation_grants` table remains 100% untouched | STATIC / RUNTIME | D0d, D10 | PASS |
| 35 | Grants isolation under failure: Activation grants unchanged after transaction rollback | RUNTIME | D10, D14 | PASS |
| 36 | Session status transition: Atomic move from `CALCULATED` to `ACCEPTED` (terminal) | RUNTIME | D14, D22 | PASS |
| 37 | Audit logging: Records `CALIBRATION_ACCEPTED` event in `api_audit_logs` | STATIC | D14 | PASS |
| 38 | Immutable history surface: Zero `UPDATE` or `DELETE` routes/services for revisions | STATIC | D8, D12c | PASS |
| 39 | Rollback policy: Rollback creates new forward revision (`ROLLBACK_FORWARD`) | STATIC / RUNTIME | D8 | PASS |
| 40 | Read API endpoints: `GET /pricing/revisions` and `GET /pricing/revisions/:id` mounted | STATIC / RUNTIME | D12c, D12d | PASS |

---

## 2. Evidence Summary

```text
✓ Phase 193D Smoke Suite:          29 passed / 0 failed
✓ Phase 193C Smoke Suite:          23 passed / 0 failed
✓ Phase 193B Regression Suite:      59 passed / 0 failed
✓ Migration Baseline Integrity:     151 SQL migrations / 0 errors / 0 collisions
✓ RC20 Canonical Pricing Suite:     ALL PASSED (P1–P35, R1–R18, F1–F12, I1–I10, A1–A6, U1–U13, T1–T20, D1–D30)
✓ Setup Auth & Icon Integrity:      10 passed / 0 failed
✓ Marketplace Adjacent Tabs:        30 passed / 0 failed
✓ Marketplace Tenant Isolation:     30 passed / 0 failed
✓ Production Build (npm run build): PASS (built in 13.21s, 0 errors)
```
