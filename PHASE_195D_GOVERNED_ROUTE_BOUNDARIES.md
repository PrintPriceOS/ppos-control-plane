# PHASE 195D — Governed Route Boundaries & Machine Breakpoints (SHADOW Mode)

**Status:** PASS & SEALED  
**Branch:** `phase-39.2-tenant-management-console`  
**Execution Mode:** `SHADOW_COMPARISON`  

---

## 0. Scientific Clarification & Scientific Invariants

> **CRITICAL SCIENTIFIC PRINCIPLE:**  
> Phase 195D route evaluations constitute **model-derived evidence** based on current configured machine economic profiles. They **DO NOT** prove or claim that a real supplier (such as Dardedze for Natur) actually used a single physical press across 500, 600, and 700 copies.
> - **CONFIRMED:** The current configured shadow model predicts Heidelberg XL 106 as the lowest manufacturing cost route for Natur 500, 600, and 700 copies.
> - **NOT PROVEN:** The supplier actually used the same press for all three quantities.
> - **NOT PROVEN:** Machine switching plays no role in real supplier quotations.
> - **STILL CONFIRMED:** Node-level aggregated calibration over 3 scalar points remains underdetermined without machine-level prior bounding.

---

## 1. Boundary Taxonomy & Precedence Hierarchy

Phase 195D formalizes route boundaries into distinct taxonomy categories to ensure capability limits are never confused with economic crossovers or governed operator rules.

### 1.1 Boundary Taxonomy
1. **`CAPABILITY_LIMIT`**: Physical or technical constraint (e.g. max sheet dimensions, unsupported binding, min/max quantity viability limits).
2. **`ECONOMIC_CROSSOVER`**: Analytical point $Q_{\text{crossover}}$ where another eligible machine becomes cheaper ($C_A(Q) = C_B(Q)$).
3. **`OPERATOR_RULE`**: Explicit, governed operator constraint (e.g. "Do not run Digital above 300 copies").
4. **`COMMERCIAL_TIER`**: Governed commercial routing policy.
5. **`CAPACITY_CONSTRAINT`**: Machine capacity or schedule limitation.
6. **`MAINTENANCE_CONSTRAINT`**: Machine unavailable due to maintenance or decommissioning.
7. **`GOVERNED_ROUTE_OVERRIDE`**: Explicit operator-pinned machine override (`OPERATOR_PINNED_MACHINE`).
8. **`ECONOMIC_TIE_ZONE`**: Region where candidates differ by less than crossover tolerance ($\Delta \text{Cost} \le €1.00$ or $\le 0.5\%$).
9. **`UNSTABLE_ROUTE_BOUNDARY`**: Pathological route thrashing ($q-1 \rightarrow A, q \rightarrow B, q+1 \rightarrow A$).

### 1.2 Deterministic Precedence Hierarchy
When evaluating route selection, candidates are filtered and selected strictly according to this precedence hierarchy:

```text
Level 1: TENANT ISOLATION & AUTHORIZATION (Fail-closed cross-tenant boundary)
Level 2: PHYSICAL CAPABILITY (Sheet dimensions, binding capability, viability limits)
Level 3: MAINTENANCE & AVAILABILITY (Status ACTIVE required)
Level 4: OPERATOR GOVERNED CONSTRAINT (Explicit validated route rules: PROHIBIT / FORCE)
Level 5: ECONOMIC COMPARISON (Lowest valid manufacturing cost)
Level 6: GOVERNED TIE-BREAK POLICY (Lower setup -> Lower variable unit cost -> Stable Machine ID)
```

---

## 2. Core Implementation Components

### 2.1 Database Schema (Migration 155)
- **File:** `migrations/155_phase195d_machine_route_rules.sql`
- **Table:** `printhouse_machine_route_rules`
- **Fields:** `id`, `tenant_id`, `printhouse_id`, `rule_name`, `rule_type`, `version`, `status` (`DRAFT`, `VALIDATED`, `SUPERSEDED`), `target_machine_id`, `conditions_json`, `action_json`, `reason_code`, `operator_note`, `checksum`, `created_by`, `created_at`, `superseded_at`.

### 2.2 Governed Route Rule Service
- **Location:** [`src/api/services/printhouseRouteRuleService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/printhouseRouteRuleService.js)
- **Functions:**
  - `createRouteRule(tenantId, printhouseId, ruleData, actor)`: Versioned creation with automatic `VALIDATED` supersession.
  - `computeChecksum(rulePayload)`: Deterministic SHA-256 hash over normalized conditions, actions, and reason codes.
  - `getActiveRouteRules(tenantId, printhouseId)`: Fetches active `VALIDATED` rules for shadow evaluation.

### 2.3 Enhanced Route Selection Service
- **Location:** [`src/api/services/productionRouteSelectionService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/productionRouteSelectionService.js)
- **New Capabilities:**
  - `evaluateBoundaryProbes(tenantId, printhouseId, bookSpec, q, options)`: Evaluates $q-1, q, q+1$ boundary probes and detects route instability (`UNSTABLE_ROUTE_BOUNDARY`).
  - `deriveRouteIntervals(tenantId, printhouseId, bookSpec, minQ, maxQ, options)`: Derives quantity intervals `[minQuantity, maxQuantity]` with recommended machine and boundary reasons.
  - **Tie-Zone Logic:** Classifies `ECONOMIC_TIE_ZONE` when route costs differ by less than €1.00 or 0.5%, applying deterministic tie-break policy without random flapping.

### 2.4 REST API Endpoints
- Mounted in [`src/api/routes/printhouseOnboardingRoutes.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/printhouseOnboardingRoutes.js):
  - `POST /api/printhouse/onboarding/pricing/route-rules`
  - `GET /api/printhouse/onboarding/pricing/route-rules`
  - `POST /api/printhouse/onboarding/pricing/routes/probes`
  - `POST /api/printhouse/onboarding/pricing/routes/intervals`

---

## 3. Empirical Evaluation & Case Studies

### 3.1 Natur Analysis (500, 600, 700 copies)
- **Model Recommendation:** Heidelberg XL 106 across all 3 quantities (€1,269.00 / €1,345.80 / €1,422.60).
- **Boundary Analysis:** No capability boundary or operator rule triggered in the 500–700 quantity span. Crossover to Digital occurs only below Q ≈ 193 under default synthetic profiles.

### 3.2 Stutensee Analysis (250, 300 copies)
- **Model Recommendation:** Heidelberg XL 106 across both quantities (€1,485.00 / €1,545.00).
- **Evidence Governance Independence:** Stutensee quote evidence unit price inconsistency (`INCONSISTENT_UNIT_PRICE` at 300 copies) remains strictly preserved in evidence governance and is not masked by machine route selection.

---

## 4. Test Matrix

- **Test Suite:** [`tests/smoke_phase195d_route_boundaries.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/smoke_phase195d_route_boundaries.js)
- **Verification Result:** **20/20 PASS**

| Test ID | Description | Status |
| :--- | :--- | :--- |
| **195D-01** | Economic crossover derived analytically ($Q \approx 517$) | PASS |
| **195D-02** | Zero hardcoded quantity thresholds | PASS |
| **195D-03** | Capability limit distinct from economic crossover | PASS |
| **195D-04** | Governed operator rule override (`OPERATOR_RULE`) | PASS |
| **195D-05** | Precedence hierarchy enforced (Level 1..6) | PASS |
| **195D-06** | Tie-zone classification & deterministic tie-break (`ECONOMIC_TIE_ZONE`) | PASS |
| **195D-07** | Route stability (anti-flapping) | PASS |
| **195D-08** | Boundary probes at $q-1$, $q$, $q+1$ | PASS |
| **195D-09** | Route intervals derived across range `[100, 1000]` | PASS |
| **195D-10** | Profile checksum pinned in crossover metadata | PASS |
| **195D-11** | Stale crossover invalidation on profile version change | PASS |
| **195D-12** | Cross-tenant route rule isolation | PASS |
| **195D-13** | Route rule SHA-256 checksum determinism | PASS |
| **195D-14** | Historical rule supersession immutability | PASS |
| **195D-15** | SHADOW comparison mode authority preserved (`LEGACY_NODE_RATES_JSON`) | PASS |
| **195D-16** | `ratesJsonMutated` = false | PASS |
| **195D-17** | `revisionCreated` = false, `forwardPricingConsumed` = false | PASS |
| **195D-18** | Natur evaluated as model evidence without supplier-production claims | PASS |
| **195D-19** | Stutensee routing evaluated independently of evidence check | PASS |
| **195D-20** | Forward pricing legacy node rates strictly untouched | PASS |

---

## 5. Handoff & Recommendation for Phase 195E

With Phase 195D sealed, PPOS possesses a complete diagnostic route boundary engine. For **Phase 195E — Machine-Aware Calibration**:
- **Constraint:** Do NOT attempt to solve all scalar parameters (fixed setup, click rate, paper cost, plate cost, waste, binding, hourly rate) simultaneously from 3 evidence points (e.g. 500, 600, 700). That would re-introduce severe underdetermination.
- **Strategy:** Treat versioned machine pricing profiles as **known economic priors/configuration**, and calibrate only a strictly identifiable subset of parameters (e.g. node-level efficiency scalar or machine setup multiplier).
