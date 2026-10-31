# Phase 194D — Governed Quantity Curve Acceptance Architecture & Design Specification

## Overview

Phase 194D introduces **Governed Quantity Curve Acceptance** to the PrintPrice OS Control Plane pricing calibration engine.

A multi-quantity solver candidate (Phase 194C) optimizes mathematical parameter adjustments across target observations, but numerical convergence alone does not guarantee structural safety or business coherence across volume ranges. Phase 194D establishes a strict 3-stage governance pipeline:

$$\text{Solver Candidate} \xrightarrow{\quad\text{Phase 194D Structural Validation}\quad} \text{Governed Operator Acceptance} \xrightarrow{\quad\text{Checksum Match}\quad} \text{Active Pricing Promotion}$$

---

## 1. Separation of Pipeline Stages

1. **Solver Convergence (Phase 194C Candidate):** Numerical optimization minimizes $\sum r_i^2$ across target points. Outputs an unaccepted candidate (`mode: "MULTI_QUANTITY"`).
2. **Curve Acceptance (Phase 194D Governance):** Evaluates point-level tolerances AND multi-point structural safety (monotonicity, unit cost direction, adjacent marginal costs, midpoint structural probes, declared breakpoint governance, identifiability gate, and evidence lineage). Creates an immutable pricing revision upon explicit operator approval.
3. **Active Pricing Promotion:** Proven strictly by checksum equality (`printer_nodes.rates_json` matching `printhouse_pricing_revisions.rates_checksum`). Unaccepted or rejected candidates **never** mutate `rates_json`.

---

## 2. Two-Level Acceptance Model

### 2.1 Point-Level Acceptance
For every target point $i \in \{1, \dots, N\}$:
- `quantity`: $q_i$
- `targetManufacturingPrice`: $M_i$
- `predictedManufacturingPrice`: $\hat{M}(q_i)$
- `absoluteResidual`: $|\hat{M}(q_i) - M_i|$
- `percentageResidual`: $\frac{|\hat{M}(q_i) - M_i|}{M_i}$
- `effectiveTolerance`: $\max(\text{absTol}, M_i \times \text{pctTol})$
- `withinTolerance`: Boolean check ($\text{absResidual} \le \text{effectiveTolerance}$)

### 2.2 Curve-Level Structural Acceptance
Evaluates structural coherence across sorted target quantities $q_1 < q_2 < \dots < q_N$:

1. **Total Price Monotonicity:** Verifies $M(q_{i+1}) \ge M(q_i)$. Status: `TOTAL_PRICE_MONOTONIC` vs `TOTAL_PRICE_NON_MONOTONIC`.
2. **Unit Cost Direction:** Verifies unit price $\frac{M(q_{i+1})}{q_{i+1}} \le \frac{M(q_i)}{q_i} + \epsilon$. Status: `UNIT_COST_NON_INCREASING` vs `UNIT_COST_INCREASE_DETECTED`.
3. **Adjacent Marginal Costs:** Calculates $MC_i = \frac{M(q_{i+1}) - M(q_i)}{q_{i+1} - q_i}$ for each adjacent pair. Flags negative marginal manufacturing costs ($MC_i < 0$).
4. **Midpoint Structural Probes (Between-Anchor Behavior):** Evaluates model predictions at midpoints $q_{\text{mid}} = \lfloor (q_i + q_{i+1})/2 \rfloor$. Checks total monotonicity ($M(q_i) \le M(q_{\text{mid}}) \le M(q_{i+1})$), unit cost direction ($\frac{M(q_i)}{q_i} \ge \frac{M(q_{\text{mid}})}{q_{\text{mid}}} \ge \frac{M(q_{i+1})}{q_{i+1}}$), and numerical sanity (finite, non-NaN).
5. **Breakpoint & Discontinuity Governance:** If structural non-monotonicity or unit-cost increase occurs, requires explicit declared breakpoint metadata (e.g. `DIGITAL_TO_OFFSET`, `PRESS_ROUTE_CHANGE`, `PAPER_PURCHASE_TIER`, `BINDING_ROUTE_CHANGE`, etc.). Declared discontinuities transition status to `REQUIRES_REVIEW` for operator approval. Undeclared discontinuities result in `REJECTED`.
6. **Extrapolation / Evidence Range Safety:** Derives `evidenceQuantityRange: { min: q_1, max: q_N }`. Quantities within $[q_{\min}, q_{\max}]$ are classified as `OBSERVED_RANGE`; outside quantities are classified as `EXTRAPOLATED_RANGE`.
7. **Identifiability Gate:** Candidate with `UNDERDETERMINED` identifiability status is flagged with `UNDERDETERMINED_MODEL` and blocked from automatic acceptance.
8. **Evidence Lineage Gate:** Lineage tracks `sourceEvidenceId` and `sourceOfferIndex`. Points with inconsistent source evidence (e.g. Stutensee unit price contradiction) flag `SOURCE_EVIDENCE_REQUIRES_REVIEW`.

---

## 3. Acceptance Status Model

- **Status Categories:**
  - `ACCEPTABLE`: All points pass tolerance; structural checks pass without violations.
  - `REQUIRES_REVIEW`: Requires explicit operator review (e.g. declared breakpoint, underdetermined model, or inconsistent source quotation).
  - `REJECTED`: Point tolerance failure, total monotonicity violation, unit cost increase, negative marginal cost, or undeclared discontinuity.

- **Machine-Readable Reason Codes:**
  - `POINT_OUT_OF_TOLERANCE`
  - `TOTAL_MONOTONICITY_VIOLATION`
  - `UNIT_COST_DIRECTION_VIOLATION`
  - `NEGATIVE_MARGINAL_COST`
  - `UNDECLARED_DISCONTINUITY`
  - `UNDERDETERMINED_MODEL`
  - `SOURCE_EVIDENCE_REQUIRES_REVIEW`

---

## 4. Fixture Evaluation Results

### 4.1 Natur Structural Curve Fixture
- **Targets:** $(500, 4321), (600, 4604), (700, 4846)$ (Transport €325 strictly excluded)
- **Total Price Monotonicity:** `TOTAL_PRICE_MONOTONIC` ($4321 < 4604 < 4846$)
- **Unit Price Direction:** `UNIT_COST_NON_INCREASING` (€8.642/copy $\rightarrow$ €7.673/copy $\rightarrow$ €6.923/copy)
- **Marginal Costs:**
  - $500 \rightarrow 600$: €2.8300/incremental copy
  - $600 \rightarrow 700$: €2.4200/incremental copy
- **Midpoint Probes:** Evaluated at $q=550$ and $q=650$; structurally sound (`MIDPOINTS_STRUCTURALLY_SOUND`).
- **Acceptance Result:** `ACCEPTABLE`

### 4.2 Pathological Curve Fixtures
- **Midpoint Spikes / Non-Monotonicity:** Triggers `TOTAL_MONOTONICITY_VIOLATION` $\rightarrow$ `REJECTED`.
- **Unit Cost Increase at High Volume:** Triggers `UNIT_COST_DIRECTION_VIOLATION` $\rightarrow$ `REJECTED`.
- **Negative Marginal Cost:** Triggers `NEGATIVE_MARGINAL_COST` $\rightarrow$ `REJECTED`.
- **Declared Discontinuity (Digital to Offset):** Preserves `DECLARED_DISCONTINUITY` $\rightarrow$ `REQUIRES_REVIEW` for explicit operator approval.

---

## 5. Schema Extension (Migration 152)

```sql
-- Migration 152: Governed Curve Acceptance Schema Extension
ALTER TABLE printhouse_pricing_calibration_acceptances
  ADD COLUMN IF NOT EXISTS curve_acceptance_json JSON NULL,
  ADD COLUMN IF NOT EXISTS acceptance_mode VARCHAR(32) NOT NULL DEFAULT 'SINGLE_POINT';
```

---

## 6. Tenant Isolation & Immutability Guarantees

- **Tenant Boundary:** `acceptCalibrationRun` validates `session.tenant_id === tenantId`, `run.tenant_id === tenantId`, `printerNode.tenant_id === tenantId`. Cross-tenant sessions are strictly blocked with `ACCESS_DENIED_FOREIGN_TENANT_SESSION`.
- **Revision Immutability:** Inserted revision records in `printhouse_pricing_revisions` are append-only. Historical revisions cannot be altered or overwritten.
- **Server-Side Recalculation:** Server recomputes canonical curve metrics and residuals independently of client payload parameters.

---

## 7. Phase 194E Handoff

Phase 194E will build upon Phase 194D by introducing:
1. **Multilingual PDF Quote Evidence Ingestion:** Parsing German and English quote documents via PDF intake pipelines into normalized Phase 194A evidence objects.
2. **Conversational Pricing Assistant Integration:** Exposing quote intake, multi-quantity calibration, and governed curve acceptance directly through the conversational Assistant UX.
