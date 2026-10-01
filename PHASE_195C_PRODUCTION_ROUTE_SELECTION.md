# PHASE 195C — Governed Production Route Selection & Press Comparison (SHADOW Mode)

**Status:** PASS & SEALED  
**Branch:** `phase-39.2-tenant-management-console`  
**Execution Mode:** `SHADOW_COMPARISON`  

---

## 1. Executive Summary & Verification Facts

Phase 195C establishes the deterministic **Production Route Selection & Press Comparison** layer. It evaluates physical capability eligibility, calculates manufacturing route costs using versioned machine pricing profiles (`printhouse_machine_pricing_profiles`), and dynamically discovers economic crossovers (e.g. Digital vs Offset) from intersecting cost curves **without hardcoding arbitrary quantity thresholds**.

### Verified Facts & Invariants
```text
MACHINE_PRICING_API: API_READY
MACHINE_PRICING_UI: UI_PENDING
HAWKEYE_MACHINE_PRICING_VISIBILITY: NOT_IMPLEMENTED
FORWARD_PRICING_CONSUMES_MACHINE_PROFILES: NO
FORWARD_PRICING_AUTHORITY: LEGACY_NODE_RATES_JSON
MACHINE_ROUTING_MODE: SHADOW_COMPARISON
```

1. **Zero Rates Mutation Guarantee:** Legitimate node-level `rates_json` remains 100% authoritative for forward pricing. Machine route evaluation operates strictly as a diagnostic shadow model (`ratesJsonMutated: false`, `revisionCreated: false`, `forwardPricingConsumed: false`).
2. **Economic Crossover Discovery:** Intersecting cost points ($C_{\text{Offset}}(Q) = C_{\text{Digital}}(Q)$) are derived dynamically via analytical formula:
   $$\Delta \text{Setup} = \text{Setup}_{\text{Offset}} - \text{Setup}_{\text{Digital}}, \quad Q_{\text{crossover}} = \frac{\Delta \text{Setup}}{\text{Unit}_{\text{Digital}} - \text{Unit}_{\text{Offset}}}$$
   No hardcoded quantity thresholds or arbitrary `Q <= X -> Digital` rules exist in PPOS.
3. **No Biased Recommendations:** If a single machine dominates across all evaluated test quantities (as with Natur 500/600/700 or Stutensee 250/300 under current default profiles), the system reports a flat recommendation without forcing an artificial machine switch.
4. **Metadata Integrity:** Every evaluated route response explicitly identifies `machineId`, `pricingProfileId`, `profileVersion`, and `profileChecksum`.

---

## 2. Core Implementation Components

### 2.1 Production Route Selection Service
- **Location:** [`src/api/services/productionRouteSelectionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/productionRouteSelectionService.js)
- **Key Methods:**
  - `evaluateMachineEligibility(machine, profile, bookSpec, quantity)`: Enforces capability filtering (`FORMAT_UNSUPPORTED`, `BINDING_METHOD_UNSUPPORTED`, `QUANTITY_BELOW_MIN`/`MAX`, `MACHINE_PROFILE_NOT_READY`, `MAINTENANCE_STATUS`).
  - `calculateRouteCost(machine, profile, bookSpec, quantity)`: Deterministically computes manufacturing cost using canonical signature/section/sheet derivations via `buildPriceCalibrationAdapter.js`.
  - `evaluateRoutesForQuantity(...)`: Ranks candidate routes by `manufacturingCost` ascending, respecting operator-pinned machine overrides (`OPERATOR_PINNED_MACHINE` vs `PINNED_MACHINE_INELIGIBLE`).
  - `evaluateProductionRoutes(...)`: Evaluates route costs across a quantity array and calculates analytical crossover quantity $Q_{\text{crossover}}$ if a route switch occurs.
  - `evaluateShadowRouting(...)`: Runs shadow comparison against legacy node `rates_json` price.

### 2.2 Governed REST API Endpoint
- **Location:** [`src/api/routes/printhouseOnboardingRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/printhouseOnboardingRoutes.js)
- **Endpoint:** `POST /api/printhouse/onboarding/pricing/routes/evaluate`
- **Security:** Strict fail-closed tenant authentication (`requireAuth`) requiring `PRINTHOUSE_ADMIN` or `SUPER_ADMIN` role.

---

## 3. Empirical Evaluation Results

### 3.1 Natur Evaluation (500, 600, 700 copies)
- **Book Spec:** 148 x 210 mm, 128 interior pages, softcover.
- **Route Selection Outcome:**
  - `Q=500`: Recommended Heidelberg XL 106 (€1,269.00) over Digital (€2,600.00).
  - `Q=600`: Recommended Heidelberg XL 106 (€1,345.80) over Digital (€3,112.00).
  - `Q=700`: Recommended Heidelberg XL 106 (€1,422.60) over Digital (€3,624.00).
- **Finding:** Offset is consistently cheaper across all 3 points. No artificial crossover forced. Confirming that Natur's `UNDERDETERMINED` solver status in Phase 194 stems from aggregated node-level scalar breakdown rather than an unobserved machine switch.

### 3.2 Stutensee Evaluation (250, 300 copies)
- **Book Spec:** 170 x 240 mm, 200 interior pages, softcover.
- **Route Selection Outcome:**
  - `Q=250`: Recommended Heidelberg XL 106 (€1,485.00).
  - `Q=300`: Recommended Heidelberg XL 106 (€1,545.00).

---

## 4. Test Suite & Verification Matrix

- **Test Suite:** [`tests/smoke_phase195c_production_route_selection.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/smoke_phase195c_production_route_selection.js)
- **Verification Result:** **24/24 PASS**

| Test ID | Objective | Status |
| :--- | :--- | :--- |
| **195C-01** | Candidate machine discovery | PASS |
| **195C-02** | Capability filtering: `FORMAT_UNSUPPORTED` | PASS |
| **195C-03** | Capability filtering: `BINDING_METHOD_UNSUPPORTED` | PASS |
| **195C-04** | Capability filtering: `QUANTITY_BELOW_MIN` / `MAX` | PASS |
| **195C-05** | Capability filtering: `MACHINE_PROFILE_NOT_READY` | PASS |
| **195C-06** | Deterministic route cost calculation | PASS |
| **195C-07** | Offset breakdown (setup + plates + makeready + waste + run) | PASS |
| **195C-08** | Digital breakdown (setup + click cost) | PASS |
| **195C-09** | Multi-quantity route evaluation | PASS |
| **195C-10** | Dynamic crossover discovery from economics ($Q_{\text{crossover}}$) | PASS |
| **195C-11** | Dynamic crossover non-forcing when single machine dominates | PASS |
| **195C-12** | Operator pinned machine override (`OPERATOR_PINNED_MACHINE`) | PASS |
| **195C-13** | Ineligible pinned machine handling (`PINNED_MACHINE_INELIGIBLE`) | PASS |
| **195C-14** | Sole eligible machine selection (`ONLY_ELIGIBLE_MACHINE`) | PASS |
| **195C-15** | Zero eligible machine handling (`NO_ELIGIBLE_ROUTE`) | PASS |
| **195C-16** | SHADOW mode forward pricing authority preserved (`LEGACY_NODE_RATES_JSON`) | PASS |
| **195C-17** | Shadow mode zero mutation guarantee (`ratesJsonMutated: false`) | PASS |
| **195C-18** | Real Natur evaluation (500, 600, 700 copies) | PASS |
| **195C-19** | Real Stutensee evaluation (250, 300 copies) | PASS |
| **195C-20** | Profile versioning metadata preservation | PASS |
| **195C-21** | Route result metadata completeness (machineId, profileId, version, checksum) | PASS |
| **195C-22** | REST API endpoint structure validation | PASS |
| **195C-23** | Telemetry recording (`machine_route_evaluation`) | PASS |
| **195C-24** | Fail-closed governance confirmation | PASS |

---

## 5. Architectural Conclusions & Readiness

Phase 195C successfully provides PPOS with physical press comparison and route cost calculation in **SHADOW mode**. The system is ready to evaluate machine economics in real-time alongside canonical node quotes without compromising forward pricing governance.
