# PHASE 193C — Implementation Report
## Deterministic Inverse Pricing Solver & Calibration Runs

> **Status**: **COMPLETE**
> **Classification**: **PASS**
> **Test Suites**:
> - `smoke_phase193c_inverse_solver.js`: **17 passed, 0 failed**
> - `smoke_phase193b_calibration_foundation.js`: **59 passed, 0 failed**
> **Safety Guarantees**:
> - No production DB migration executed
> - No destructive or experimental DB mutations
> - No active pricing configuration mutated
> - No `/accept` or automatic pricing activation endpoint implemented
> - Zero `Math.random()`, pure deterministic coordinate search

## 1. Canonical BPE Source of Truth & Zero Duplication

> **CANONICAL FORWARD PRICING SOURCE OF TRUTH**:
> `ppos-pricing-engine` (`buildPrice(params, house)`) is the **SINGLE AND EXCLUSIVE** forward calculation truth across PrintPrice OS.
> `ppos-control-plane` is an **orchestrator/adapter ONLY** and contains **ZERO** duplicated calculation formulas (no local paper math, print cost algebra, binding tables, or waste formulas).

- `package.json` pins `@ppos/pricing-engine` to: `git+https://github.com/PrintPriceOS/ppos-pricing-engine.git#8d324290d64b5bf17325ff1098db7ebb5f646b5d`
- `buildPriceCalibrationAdapter.js` delegates 100% of forward evaluations to canonical `buildPrice(params, house)`.
- Verified by direct bit-for-bit parity tests (`C1c`) against `@ppos/pricing-engine`.
- Regression test `C1b` ensures no duplicated formulas or sibling fallbacks exist in the Control Plane codebase.

---

## 1b. Known Baseline Defect Record (Historical Audit Trail)

> **TAG RECORD**: `phase-193b-reference-book-calibration-foundation` (`430727a944a7c005a673cddbae98e10d2dbe6220`)
> **DEFECT**: The tag contains route wiring in `printhouseOnboardingRoutes.js` (lines 394–418) referencing `../services/calibrationRunService`, which was intentionally deferred and excluded from the 193B commit.
> **IMPACT**: A clean isolated checkout of the published 193B tag cannot load `printhouseOnboardingRoutes.js` (`MODULE_NOT_FOUND`).
> **RESOLUTION**: **RESOLVED_BY_PHASE_193C** (Phase 193C canonically supplies `calibrationRunService.js`, `deterministicInversePricingSolver.js`, and migration 147).
> **ACTION**: Tag `phase-193b-reference-book-calibration-foundation` is **NOT REWRITTEN** and is preserved as immutable published history.

---

## 2. Exact Files Changed in Phase 193C

### New Files Created:
1. `migrations/147_phase193c_calibration_runs.sql` — Additive DDL creating `printhouse_pricing_calibration_runs` for immutable solver run records.
2. `src/api/services/buildPriceCalibrationAdapter.js` — Pure in-memory forward pricing adapter converting physical job specs into canonical forward parameters without persistent mutation.
3. `src/api/services/deterministicInversePricingSolver.js` — Core deterministic optimizer executing monotonic binary search for proportional scale $\alpha^*$ around baseline $\vec{\theta}_0$.
4. `src/api/services/calibrationRunService.js` — Domain service enforcing `READY` preconditions, capturing input checksums, executing the solver, and persisting run records.
5. `tests/smoke_phase193c_inverse_solver.js` — 17-test validation suite covering DDL constraints, synthetic round-trips, determinism, and API boundaries.

### Modified Files:
1. `src/api/routes/printhouseOnboardingRoutes.js` — Mounted Phase 193C endpoints (`POST /pricing/calibrations/:id/calculate`, `GET /pricing/calibrations/:id/runs`, `GET /pricing/calibrations/:id/runs/:runId`).
2. `tests/smoke_phase193b_calibration_foundation.js` — Updated boundary test Q29h to acknowledge 193C `/calculate` endpoint while ensuring `/accept` remains strictly blocked.

---

## 3. Migration 147 Schema Summary

- **Table**: `printhouse_pricing_calibration_runs`
- **Primary Key**: `id VARCHAR(64)`
- **Foreign Keys**: `tenant_id` $\to$ `tenants.id`, `calibration_session_id` $\to$ `printhouse_pricing_calibration_sessions.id`, `printer_node_id` $\to$ `printer_nodes.id`
- **Provenance Columns**: `solver_version`, `solver_config_json`, `session_input_checksum`, `rate_snapshot_checksum`, `identifiability_report_json`
- **Result Metrics**: `engine_price_before`, `engine_price_after`, `target_price`, `absolute_residual`, `percent_residual`, `evaluations_count`, `execution_duration_ms`
- **Payloads**: `active_rate_paths_json`, `proposed_patch_json`, `candidate_parameters_json`, `created_by_json`

---

## 4. Deterministic Solver Algorithm

1. **Step 1: In-Memory Adapter Translation**: Converts physical job specs (`'1/1'`, `'perfect bound'`, `'4/0'`) into internal parameters without touching DB.
2. **Step 2: Base Forward Price**: Evaluates $\widehat{P}_0 = \text{buildPrice}(\text{spec}, \vec{\theta}_0)$.
3. **Step 3: Monotonic Binary Search on $\alpha^*$**:
   - Searches $\alpha \in [0.05, 10.0]$ across $\le 30$ iterations.
   - Candidate active rates are scaled: $\vec{\theta}(\alpha) = \alpha \cdot \vec{\theta}_{0, \text{active}}$.
   - Converges when $|\widehat{P}(\alpha) - Y_{\text{target}}| \le 0.05$ EUR or relative residual $\le 0.01\%$.
4. **Step 4: Solution Classification**:
   - `SUCCEEDED`: Residual meets governed tolerances.
   - `NO_SOLUTION`: Target out-of-bounds or unable to satisfy tolerances.
   - `AMBIGUOUS`: Flagged in identifiability report as prior-anchored candidate.

---

## 5. Transport Decoupling & Reference Data Strategy
 
- In Phase 193C, `transportPricePerKg` (supplied by the printhouse in €/kg) is preserved and reported as an external observable benchmark.
- **Critical Invariant**: It is **NOT** mapped into BPE `rates.transport_costs.{country}` (which in the legacy engine represents pallet/container unit models, not €/kg).
- Transport is marked in the identifiability report as `EXTERNAL_REFERENCE_ONLY`.
- Changing `transportPricePerKg` has zero influence on manufacturing scale factor $\alpha^*$ or the proposed candidate patch.
- Forward calculations isolate manufacturing price from logistics lines. Unsupported destination countries raise explicit `UNSUPPORTED_BPE_TRANSPORT_COUNTRY` warnings without failing manufacturing calibration or falling back to arbitrary rates.

---

## 6. Safety & Governance Guarantees

1. `buildPrice` forward logic remains pure and canonical.
2. Solver evaluations happen 100% in memory with deep-cloned rate cards.
3. `/accept` is strictly **NOT** implemented in Phase 193C. Calibrated candidate patches cannot be written into `printer_nodes.rates_json` or published to marketplace grants.
