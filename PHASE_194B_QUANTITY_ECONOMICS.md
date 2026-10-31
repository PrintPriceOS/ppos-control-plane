# PHASE 194B — QUANTITY ECONOMICS DOMAIN MODEL REPORT

**Phase:** `194B`  
**Repository Branch:** `phase-39.2-tenant-management-console`  
**Baseline SHA:** `a7bd9c1e7a57a8bfec32205510dd169cce32cbff`  
**Phase 194B Commit SHA:** `c04e221` (to be created & reported)  
**Status:** `COMPLETED & VERIFIED (STOPPING FOR OPERATOR REVIEW)`  

---

## 1. Problem Statement & Architecture Principle

Linear unit pricing ($P = \text{unitPrice} \times q$) fails to represent industrial book printing economics. In reality, manufacturing cost follows:

$$P(q) = \text{fixedSetup} + \text{paper}(q) + \text{pressRun}(q) + \text{binding}(q) + \text{finishing}(q) + \text{packaging}(q)$$

with possible discrete route changes (e.g. Digital $\rightarrow$ Offset) at quantity thresholds.

### Key Domain Principles:
1. **Additive Domain Layer:** Quantity Economics wraps around existing pricing without replacing or bypassing `@ppos/pricing-engine` or `buildPriceCalibrationAdapter.js`.
2. **Deterministic Evaluation:** 100% deterministic segment lookup, fixed + marginal cost calculation, and boundary evaluation (zero LLM decisions).
3. **Logistics Separation:** Quantity Economics applies strictly to `manufacturingPrice`. Transport is strictly excluded.
4. **Declared Discontinuity Metadata:** Route changes or step cost jumps require explicit `reason` metadata (`DIGITAL_TO_OFFSET`, `PRESS_ROUTE_CHANGE`, etc.). Undeclared discontinuities fail validation.
5. **No Overfitting Principle:** Evidence observations (such as Natur's 500 $\rightarrow$ €4321, 600 $\rightarrow$ €4604, 700 $\rightarrow$ €4846) do not automatically create arbitrary model breakpoints. Model representation is defined in Phase 194B; multi-point fitting/calibration occurs in Phase 194C.

---

## 2. Canonical Domain Model Schema

Implemented in [`src/api/services/quantityEconomicsService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/quantityEconomicsService.js):

```json
{
  "model": "PIECEWISE_MARGINAL",
  "version": 1,
  "segments": [
    {
      "segmentId": "seg-small",
      "minQuantity": 1,
      "maxQuantity": 499,
      "fixedComponent": 1000.00,
      "marginalPerCopy": 2.00,
      "adjustmentComponent": 0.00,
      "route": "DIGITAL",
      "reason": null,
      "continuity": "CONTINUOUS"
    },
    {
      "segmentId": "seg-large",
      "minQuantity": 500,
      "maxQuantity": null,
      "fixedComponent": 1200.00,
      "marginalPerCopy": 1.20,
      "adjustmentComponent": 0.00,
      "route": "OFFSET",
      "reason": "DIGITAL_TO_OFFSET",
      "continuity": "DECLARED_DISCONTINUITY"
    }
  ]
}
```

---

## 3. Deterministic Evaluation API

- `validateQuantityEconomicsModel(model)`: Validates range continuity, segment bounds, non-negative components, lack of gaps/overlaps, and valid breakpoint reason metadata.
- `resolveQuantitySegment(model, quantity)`: Performs exact deterministic lookup for target `quantity`.
- `evaluateQuantityEconomics(model, quantity)`: Evaluates `fixedComponent + (marginalPerCopy * quantity) + adjustmentComponent` and returns `manufacturingPrice` and `averageUnitManufacturingPrice`.
- `evaluateQuantitySeries(model, quantities)`: Evaluates a sequence of target quantities in stable sorted order.

---

## 4. Verification & Test Suite Summary

Executed test suite [`tests/smoke_phase194b_quantity_economics.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/smoke_phase194b_quantity_economics.js):
- `194B-01`: Single-segment model validates
- `194B-02`: Fixed + marginal evaluation is correct (Fixture A: Q=100 $\rightarrow$ €1200, Q=200 $\rightarrow$ €1400, Q=300 $\rightarrow$ €1600)
- `194B-03`: Average unit cost calculated correctly (Q=100 unit €12.00, Q=200 unit €7.00, Q=300 unit €5.333333)
- `194B-04` & `194B-05`: Piecewise segment selection & exact boundary (Q=499 selects seg-small, Q=500 selects seg-large)
- `194B-06`: Open-ended final range works (`maxQuantity: null`)
- `194B-07` to `194B-11`: Validation rejections (overlaps, invalid qty, NaN/Infinity, negative components, unknown reasons)
- `194B-12`: Declared route change metadata preserved (`DIGITAL_TO_OFFSET`)
- `194B-13` to `194B-15`: Quantity series evaluation & Natur `[500, 600, 700]` evaluation
- `194B-16` & `194B-17`: Zero active rates mutation & 100% Phase 194A compatibility
- **Results:** `17 passed, 0 failed`

### Regression Suites:
- `smoke_phase194a_quote_evidence.js`: `17 passed, 0 failed`
- `smoke_phase193c_inverse_solver.js`: `24 passed, 0 failed`
- `smoke_pricing_hawkeye.js`: `10 passed, 0 failed`
- `npm run build`: `Built in 12.47s`

---

## 5. Persistence & DB Migration Decision

- **Decision:** Deferred DB migration for Phase 194B.
- **Rationale:** Quantity Economics models are currently evaluated strictly in memory as additive domain objects. Adding DB persistence tables (`printhouse_quantity_economics_models`) is deferred to **Phase 194C Multi-Quantity Calibration** when session-level and revision-level governance persistence schemas are established.

---

## 6. Handoff to Phase 194C

Phase 194B domain model is complete.
In **Phase 194C Multi-Quantity Calibration**, the deterministic inverse pricing solver will consume this Quantity Economics model to optimize active rates simultaneously against multiple target points (e.g. Natur 500 $\rightarrow$ €4321, 600 $\rightarrow$ €4604, 700 $\rightarrow$ €4846) instead of solving isolated single points.
