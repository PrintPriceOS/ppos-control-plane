# Phase 194G — Governed Evidence → Calibration Targets → Recalibration Handoff

## Overview & Architecture

Phase 194G completes the governed end-to-end pricing workflow:
```
PDF Quotation / Quote Document
↓
Extraction & Translation / Normalization (Phase 194E)
↓
Quote Evidence Review (Phase 194A / 194F)
↓
Operator Corrections & Confirmation (Phase 194F)
↓
Evidence Eligibility Gate & Target Formation (Phase 194G)
↓
Multi-Quantity Deterministic Inverse Solver (Phase 194C)
↓
Server-Side Governed Curve Validation (Phase 194D)
↓
Explicit Operator Acceptance (Two-Step Action)
↓
Immutable Pricing Revision & Checksum Activation
↓
Hawk-Eye Read Model Propagation
```

---

## Key Governed Invariants

1. **Rule Canon**:
   - *Jev may advise. Deterministic governance decides. Human operator accepts.*

2. **No State Skipping**:
   - `RAW_EVIDENCE` → `EXTRACTED` → `VALIDATED` → `REVIEWED` → `READY_FOR_CALIBRATION_REVIEW` → `CALIBRATION_TARGETS_CONFIRMED` → `CALIBRATION_RUN` → `CURVE_VALIDATION` → `OPERATOR_ACCEPTED` → `REVISION_CREATED` → `ACTIVE_REVISION`.

3. **Stutensee Inconsistency Gate**:
   - Stutensee 300 unit price (€3.05 quoted vs €5.0833 computed) remains marked `INCONSISTENT_UNIT_PRICE` and REQUIRES_REVIEW. It CANNOT be automatically promoted into calibration targets without explicit operator confirmation.

4. **Natur Target Basis & Transport Exclusion**:
   - For Natur 500/600/700:
     - Target 500: €4,321
     - Target 600: €4,604
     - Target 700: €4,846
   - Target basis MUST be `MANUFACTURING_PRICE`. Transport (€325) is strictly excluded from manufacturing calibration.

5. **Same-BookSpec Variant Gate**:
   - For documents with distinct variants (e.g., Fährmann Munken Print Cream 1.5 vs Munken Premium Cream 1.3), `SAME_CANONICAL_BOOKSPEC` is enforced. Mixed variant selections return `MIXED_BOOKSPEC_TARGETS` and are rejected.

6. **Two-Step Operator UX Action**:
   - Step 1: `[Run Calibration]` (calculates candidate run & validates curve server-side).
   - Step 2: `[Accept Calibration]` (explicit second action requiring confirmation modal).

7. **Stale Baseline & Idempotency Protection**:
   - Acceptance checks `baselineRatesChecksum == current printer_nodes.rates_json checksum`. If baseline changed in flight, returns `STALE_CALIBRATION_BASELINE`.
   - Repeated acceptance calls on the same calibration run return the existing revision ID deterministically without creating duplicate revisions.

---

## Test Verification

- `smoke_phase194g_evidence_calibration_handoff.js`: **24/24 PASS**
- `acceptance_phase194g_end_to_end.js`: **PASS (Real Natur PDF E2E)**
- All previous Phase 194 suites (194A through 194F): **100% PASS**
- `npm run build`: **PASS**
