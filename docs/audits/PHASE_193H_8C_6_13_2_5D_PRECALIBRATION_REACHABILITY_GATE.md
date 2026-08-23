# PHASE 193H.8C.6.13.2.5D — PRE-CALIBRATION REACHABILITY GATE AUDIT REPORT

```text
================================================================================
PHASE 193H.8C.6.13.2.5D: PRE-CALIBRATION REACHABILITY GATE AUDIT
STATUS: READY_FOR_PRECALIBRATION_GATE_USE
STAGE 1 CONTROLLED BETA: AUTHORIZED
UNRESTRICTED PRODUCTION: NOT_AUTHORIZED
OPERATIONAL MODE: STRICTLY READ-ONLY (ZERO DB MUTATIONS)
================================================================================
```

---

## 1. Executive Summary & Motivation

During Phase 6.13.2.5C, Reference Job D was submitted with a target manufacturing price of **€1,790.14**. The deterministic inverse solver correctly locked the 6 historically established paths (from accepted Revisions 1 and 2), isolated the 2 novel perfect bound paths (`binding_pb_fixed_by_sections.12` and `binding_pb_var_per_1000_by_sections.12`), and scaled both novel paths down to the solver minimum search bound ($\alpha_{\min} = 0.05$).

However, the locked physical paper cost floor alone (€1,944.00 interior offset + €55.21 cover MC = €1,999.21) exceeded the commercial target, yielding an asymptotic minimum forward price of **€2,008.04** (residual: €217.90 / 12.17%). The solver fail-closed with `NO_SOLUTION`.

To prevent uncalibratable or mathematically contradictory commercial targets from entering the mutating session/run lifecycle, **Phase 193H.8C.6.13.2.5D** introduces a preflight, side-effect free **Pre-Calibration Reachability Gate Service** (`CalibrationReachabilityService`).

---

## 2. Core Architecture & Exact Reachability Algorithm

The reachability service evaluates whether a candidate physical specification and target price can theoretically be reached by varying only the un-locked degrees of freedom within solver-governed bounds, while preserving all historical locked rates.

```text
Candidate BookSpec + Target Price (€T) + Tenant + Printer Node
        │
        ├── 1. Read live rates_json snapshot (θ0) & compute checksum
        ├── 2. Resolve revision lineage & union of historically established paths (LockedRatePaths)
        ├── 3. Forward evaluate initial baseline price (PriceBefore) via buildPriceCalibrationAdapter
        ├── 4. Extract active rate paths & partition:
        │       ├── Locked Paths (preserve baseline snapshot value exactly)
        │       └── Calibratable Paths (subject to calibration)
        ├── 5. Governance Preflight: verify no unqualified zero anchors on calibratable leaves
        ├── 6. Lower Bound Forward Price (P_min):
        │       Forward evaluate with calibratable paths scaled by scaleMin (0.05)
        ├── 7. Upper Bound Forward Price (P_max):
        │       Forward evaluate with calibratable paths scaled by scaleMax (10.0)
        └── 8. Classify Reachability:
                ├── T < P_min  ──> BELOW_REACHABLE_FLOOR (Distance = P_min - T)
                ├── T > P_max  ──> ABOVE_REACHABLE_CEILING (Distance = T - P_max)
                ├── P_min <= T <= P_max ──> REACHABLE (Distance = 0.0)
                └── Contract / Lineage / Zero violation ──> BLOCKED
```

---

## 3. Solver Lower/Upper Bound & Zero-Anchor Semantics

1. **Solver Bounds**:
   - `scaleMin`: `0.05` (Lowest valid scaling multiplier permitted by the inverse solver).
   - `scaleMax`: `10.0` (Highest valid scaling multiplier permitted by the inverse solver).
2. **Zero Anchor Governance**:
   - Calibratable paths with explicit `0.0` value on essential components must possess a governed prior (e.g. PB binding prior `0.164` / `14.7`).
   - Calibratable paths with explicit `0.0` and no governed prior fail closed with `UNQUALIFIED_ZERO_ANCHOR` (`BLOCKED`).
   - Historically locked paths with `0.0` value are preserved as-is without failing or injecting priors.

---

## 4. Crucial Governance Distinction

> [!IMPORTANT]
> **REACHABILITY DOES NOT EQUAL ACCEPTABILITY, IDENTIFIABILITY, OR AUTHORIZATION**
> - `REACHABLE` only proves that the target price falls inside $[P_{\min}, P_{\max}]$ under current active degrees of freedom.
> - It does **not** guarantee that the inverse solver will find an acceptable candidate, that parameters are uniquely identifiable, or that the result is authorized for pricing revision promotion.

---

## 5. API Exposure

A side-effect free REST endpoint is mounted on the onboarding router:
- **Route**: `POST /api/printhouse/onboarding/pricing/calibrations/reachability`
- **Controller**: `calibrationReachabilityService.analyzeReachability(payload)`
- **Safety**: Pure analytical evaluation. Creates zero database records.

---

## 6. Job D Production Validation & Regression Results

### Diagnostic Replay for Job D:
```json
{
  "status": "BELOW_REACHABLE_FLOOR",
  "targetPrice": 1790.14,
  "currency": "EUR",
  "currentPrice": 2175.77,
  "minimumReachablePrice": 2008.04,
  "maximumReachablePrice": 3939.77,
  "absoluteDistanceToReachableRange": 217.90,
  "activePathCount": 8,
  "lockedPathCount": 6,
  "calibratablePathCount": 2,
  "currentRatesChecksum": "727caec4cb4f3237dbc0db210303ebb2f21f40b8d63dd0e3d8f6f852633b0c0d",
  "activeRevisionId": "prev-3c025b51",
  "diagnostics": {
    "allPathsLocked": false,
    "degreesOfFreedom": 2,
    "signature": 16,
    "sections": 12
  }
}
```

---

## 7. Test Suites & Verification Results

| Suite | Tests Passed | Status |
|---|---|---|
| `smoke_phase193h8c61325d_precalibration_reachability.js` | 10 / 10 | PASS ✅ |
| `smoke_phase193c_hardcover_endpaper_coverage.js` | 9 / 9 | PASS ✅ |
| `smoke_phase193c_binding_prior_governance.js` | 6 / 6 | PASS ✅ |
| `test_phase193c_deterministic_solver.js` | 24 / 24 | PASS ✅ |
| `test_phase193c_established_paths_resolver.js` | 1 / 1 | PASS ✅ |
| `smoke_phase193c_incremental_run_integration.js` | 1 / 1 | PASS ✅ |
| `smoke_phase193h8c61322_multi_reference_regression.js` | 6 / 6 | PASS ✅ |
| **Total Automated Assertions** | **57 / 57** | **100% PASS** |
| `npm run build` | Vite Production Bundle | **SUCCESS ✅** |

---

## 8. Hard Safety Invariants Verification

- **Sessions Created**: Exactly **0**
- **Calibration Runs Created**: Exactly **0**
- **Pricing Revisions Created**: Exactly **0**
- **Printer Node Rates Mutated**: **NO** (`printer_nodes.rates_json` remains on Revision 3)
- **Active Checksum**: `727caec4cb4f3237dbc0db210303ebb2f21f40b8d63dd0e3d8f6f852633b0c0d` (Unchanged)
- **Historical Evidence Preservation**: Session `cal-ad0bd0d5` and Run `crun-a8203c3d` remain untouched in database as audit records.

---

## 9. Final Recommendation

```text
================================================================================
STATUS: READY_FOR_PRECALIBRATION_GATE_USE
AUDIT VERDICT: PASS
================================================================================
```
