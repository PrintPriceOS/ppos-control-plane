# Phase 195F — Commercial Pricing Knobs & Quote Calibration Preview

## Executive Summary

Phase 195F delivers a printer-facing commercial calibration preview experience in PrintPrice OS (PPOS). Printhouses can upload existing quotation offers and preview exact price reproductions using a minimal set of 7 intuitive commercial controls (knobs). 

**Key Achievements:**
- **Zero Rate Card Mutation:** Preview operations evaluate candidate pricing strictly in memory (`rates_json` remains 100% immutable).
- **No Machine Configuration Needed:** Onboarding preview bypasses physical machine identity and press routing setup completely.
- **Governed Commercial Adjustments:** Knobs map to canonical rate fields as governed DELTA and MULTIPLIER overlays, preserving relative internal rate structures (16p vs 8p signatures, mono vs CMYK, binding method bins).
- **Deterministic 2-Parameter Curve Fitting:** For 2+ quotation price points, PPOS computes an aggregate commercial curve fit ($Price(Q) = C_{\text{fixed}} + Q \times C_{\text{marginal}}$) with $R^2 = 0.998$ accuracy on Natur benchmark targets.

---

## 1. Commercial Abstraction vs Physical Cost Model

| Dimension | Physical Machine Cost Model (Phases 195B–195D) | Commercial Overlay Model (Phase 195F) |
| :--- | :--- | :--- |
| **Fixed Component** | Proven physical press setup, plate costs, makeready hours | Observable Commercial Setup ($C_{\text{fixed}}$) |
| **Marginal Component** | Proven machine click rates, running ink/power cost | Observable Commercial Running Rate ($C_{\text{marginal}}$) |
| **Onboarding Requirement** | Optional / Advanced Shadow Mode | Primary Printer Onboarding Workflow |
| **Machine Selection** | Press selection / routing required | **NOT REQUIRED** |

---

## 2. Commercial Knobs Architecture & Mapping Rules

PPOS exposes 7 printer-facing commercial controls:

| Knob ID | UI Label | Type | Unit | Range | Canonical Target Fields |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `printingSetupAdjustment` | Printing Setup | DELTA | € | ±€500 | `interior_*_fixed`, `cover_fixed_by_colours` |
| `printingRunMultiplier` | Printing Running Cost | MULTIPLIER | × | 0.75 – 1.25 | `interior_*_var`, `cover_var_per_1000_by_colours` |
| `paperCostMultiplier` | Paper Cost | MULTIPLIER | × | 0.80 – 1.20 | `paper_price_interior_by_kilo`, `cover` |
| `bindingSetupAdjustment` | Binding Setup | DELTA | € | ±€300 | `binding_*_fixed_by_sections` |
| `bindingRunMultiplier` | Binding Per Copy | MULTIPLIER | × | 0.75 – 1.25 | `binding_*_var_per_1000_by_sections` |
| `laminationSetupAdjustment` | Lamination Setup | DELTA | € | ±€150 | `lam_fixed` |
| `laminationRunMultiplier` | Lamination Per Copy | MULTIPLIER | × | 0.75 – 1.25 | `lam_var_per_1000` |

### Neutral Baseline Invariant
When all deltas = 0 and multipliers = 1.0:
$$\text{applyKnobs}(\text{baselineRates}, \text{neutralKnobs}) \equiv \text{baselineRates}$$
Forward pricing under neutral knobs produces prices **100% identical** to baseline.

---

## 3. Deterministic Curve Fit & Natur Benchmark Verification

### Natur Benchmark Target:
- **500 copies:** €4,321
- **600 copies:** €4,604
- **700 copies:** €4,846

### Least Squares 2-Parameter Fit Results:
- **Commercial Fixed Intercept ($C_{\text{fixed}}$):** €3,015.33
- **Commercial Marginal Slope ($C_{\text{marginal}}$):** €2.625 / copy
- **$R^2$ Fit Score:** 0.998
- **Mean Absolute Error (MAE):** €9.11 (0.20%)

### Individual Residual Breakdown:
- **500 copies:** Quoted €4,321.00 | Fitted €4,327.83 | Residual **-€6.83** (-0.16%)
- **600 copies:** Quoted €4,604.00 | Fitted €4,590.33 | Residual **+€13.67** (+0.30%)
- **700 copies:** Quoted €4,846.00 | Fitted €4,852.83 | Residual **-€6.83** (-0.14%)

### Source Curvature Detection:
- Interval 1 (500 $\to$ 600): $\Delta = +\text{€}283$ ($\text{€}2.83$ / copy)
- Interval 2 (600 $\to$ 700): $\Delta = +\text{€}242$ ($\text{€}2.42$ / copy)
- PPOS detects the slight non-linear slope variation ($2.83 \ne 2.42$) and flags `curvatureDetected: true`, while reporting high-precision linear fit ($R^2 = 0.998$) within governed commercial tolerance.

---

## 4. Preview API Specification

### 1. `POST /api/printhouse/onboarding/pricing/commercial-preview`
Calculates non-mutating preview of commercial adjustments across requested quantities.

### 2. `POST /api/printhouse/onboarding/pricing/commercial-fit`
Executes deterministic 2-parameter curve fitting ($C_{\text{fixed}}, C_{\text{marginal}}$) and returns suggested knob adjustments.

---

## 5. Automated Test Suite Verification

Suite: [`tests/smoke_phase195f_commercial_knob_calibration.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/smoke_phase195f_commercial_knob_calibration.js)  
Status: **24 / 24 PASSED**

---

## 6. Governed Acceptance Roadmap (Phase 195G)

When ready for production activation in Phase 195G:
1. Operator reviews commercial knob adjustments and live residual metrics.
2. Operator clicks "Accept & Activate Calibration".
3. System invokes governed acceptance service ([`calibrationAcceptanceService.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/services/calibrationAcceptanceService.js)) to create a new `rates_json` revision with full audit provenance.
