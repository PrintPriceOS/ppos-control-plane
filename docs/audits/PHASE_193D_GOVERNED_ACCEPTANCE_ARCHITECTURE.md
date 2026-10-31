# PHASE 193D — Governed Calibration Review & Safe Patch Acceptance
## Architecture & Governance Design Document

> **Auditor/Designer**: Google Deepmind (Antigravity)
> **Branch**: `ppos-control-plane` (working tree)
> **Date**: 2026-08-20
> **Status**: **IMPLEMENTED**
> **Safety Invariants**: Pure in-memory calculation & forward verification; atomic MySQL transaction with row-level locks (`SELECT ... FOR UPDATE`); exact baseline drift check; zero marketplace grant mutations.

---

## 1. Current Active Pricing Persistence Model

### 1.1 Tables & Schema Surfaces
1. **Primary Industrial Configuration**:
   - `printer_nodes.rates_json` (`JSON NULL`) — Stores the canonical industrial rate matrix consumed by BPE.
   - Key paths: `interior_*_colour_*`, `cover_*`, `binding_*`, `lam_*`, `uv_varnish`, `paper_*`, `transport_costs`.
2. **Commercial Policy Layer (Phase 191F)**:
   - `printhouse_price_books`, `printhouse_pricing_rules`, `printhouse_quantity_tiers` — Governing downstream commercial quotes and rules.
3. **Write Paths**:
   - Manual Edit: `PUT /api/printhouse/onboarding/pricing/industrial`
   - Governed Acceptance: `POST /api/printhouse/onboarding/pricing/calibrations/:id/accept`

---

## 2. Immutable Revision Strategy (Migration 148)

To eliminate destructive in-place rate mutation and establish complete forward-rollbacks, Phase 193D introduces **`printhouse_pricing_revisions`** and **`printhouse_pricing_calibration_acceptances`**.

```mermaid
graph TD
    A[Calibration Session: READY] --> B[Deterministic Run: crun-xxx]
    B --> C[Human Manager Review]
    C --> D[POST /calibrations/:id/accept { runId }]
    D --> E{Drift Check: currentBaselineChecksum == run.rate_snapshot_checksum?}
    E -->|Mismatch| F[409 Conflict: BASELINE_DRIFT_DETECTED]
    E -->|Match| G[Server-Side Proposal Integrity: Checksum Verified]
    G --> H[Safe Deep Merge in Memory: currentRates + proposedPatch]
    H --> I[Forward BPE buildPrice Verification on Merged Rates]
    I -->|Residual <= Effective Tolerance| J[Atomic MySQL Transaction]
    I -->|Residual > Tolerance| K[422 Unprocessable: CALIBRATION_ACCEPTANCE_TOLERANCE_EXCEEDED]
    J --> L[1. Insert printhouse_pricing_revisions]
    J --> M[2. Update printer_nodes.rates_json]
    J --> N[3. Insert printhouse_pricing_calibration_acceptances]
    J --> O[4. Transition Session -> ACCEPTED]
    J --> P[5. Write Audit Log Event: CALIBRATION_ACCEPTED]
    J --> Q[Commit Transaction]
```

### 2.1 Acceptance Tolerance Policy
Governance acceptance tolerance is distinct from solver numerical convergence thresholds:
$$\text{effectiveTolerance} = \max\Big(\text{configuredAbsoluteTolerance},\; \text{targetManufacturingPrice} \times \text{configuredPercentTolerance}\Big)$$
- Defaults: Absolute = 0.50 EUR, Percent = 0.50% (0.005).
- If $\Delta = |\widehat{P}_{\text{mfg}} - P_{\text{target}}| > \text{effectiveTolerance}$, the acceptance is rejected and no database mutation occurs.

### 2.2 Proposal & Revision Immutability
- Client supplies strictly `{ "runId": "..." }`. No client-supplied rates or patches are accepted.
- `printhouse_pricing_revisions` stores the **complete** resulting `rates_json` document along with exact BPE package, version, and commit SHA provenance.
- Rollback policy: Rollbacks create a new revision (`source_type = 'ROLLBACK_FORWARD'`) pointing to `parent_revision_id`. Historical revision records are never deleted or modified.
- Concurrency protection: `printhouse_pricing_calibration_acceptances.calibration_run_id` enforces a `UNIQUE` database constraint, guaranteeing exactly one winner in concurrent race conditions.
