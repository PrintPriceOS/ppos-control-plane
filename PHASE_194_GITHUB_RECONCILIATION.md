# PHASE 194 — GITHUB RECONCILIATION REPORT

**Repository:** `https://github.com/PrintPriceOS/ppos-control-plane.git`  
**Target Branch:** `phase-39.2-tenant-management-console`  
**Remote SHA / HEAD:** `4842f8d231f70368ccaeb67085fc520f028948bd`  
**Reconciliation Timestamp:** `2026-09-30T23:58:00+02:00`  

---

## 1. Remote Branch Status & Commit Chain

The remote branch `origin/phase-39.2-tenant-management-console` is at commit `4842f8d231f70368ccaeb67085fc520f028948bd`.

### Key Commit History:
- `4842f8d` - `fix(ui): aggregate blockers across all setup modules and improve error detail messaging in MarketplaceReadinessPanel`
- `516e3ec` - `fix(api): expose computeOperationalReadiness method on PrinthouseReadinessService to fix 500 error on submit-for-review`
- `29234f8` - `docs(readme): update control plane version to v1.9.5 (Phase 193H) and add Printhouse Onboarding Hub & Hawkeye Pricing documentation`
- `433ad48` - `fix(api): mount missing printhouse shipping and onboarding routes in server.js and add missing Lucide icon imports`
- `08e52ae` - `fix(ui): prefer fresh printhouse API data over router state`
- `53b7b61` - `feat(pricing): expose canonical governance metadata in printhouse Hawk-Eye`
- `84a2b79` - `feat(ui): add truthful pricing Hawk-Eye overview for printhouse detail`
- `792cc65` - `test(pricing): add read-only 3-way hydration integrity verifier`
- `4d82148` - `feat(solver): expose read-only selectedSignature and selectedSections in solve result payload`
- `dbce5bf` - `fix(ui): ensure robust printhouse detail page resolution by canonical id and _id`
- `d09450e` - `fix(pricing): enable progression to step 4 when manufacturing cost is provided`
- `38fadb6` - `fix(onboarding): mount /sites and /company-profile endpoints and expose nodeName in industrial pricing`
- `4748dbf` - `fix(pricing): resolve field mapping in revision history drawer and add calibrated books history modal`
- `7865fd9` - `feat(ui): implement choice-first pricing workflow selector in printhouse hub (phase 193h)`

---

## 2. Existing Pricing Architecture Map

| Component / Entity | Exact Code Location | Role / Invariants |
| :--- | :--- | :--- |
| **Rates JSON Schema** | `printer_nodes.rates_json` (DB) | Canonical pricing parameters (interior, cover, binding, paper, lamination, UV varnish, endpapers). Immutably snapshotted & checksummed on revision acceptance. |
| **Pricing Revisions** | `printhouse_pricing_revisions` (DB) | Immutable revision log with SHA-256 rates checksum, engine commit/version, and provenance links to calibration sessions/runs. |
| **Calibration Sessions** | `printhouse_pricing_calibration_sessions` (DB) | Durable reference book specifications, target manufacturing prices, transport prices, and commercial inclusion flags (`includes_paper`, etc.). Status: `DRAFT`, `READY`, `CALCULATED`, `ACCEPTED`, `REJECTED`. |
| **Calibration Runs** | `printhouse_pricing_calibration_runs` (DB) | Solver run records capturing inputs checksum, proposed patch JSON/checksum, residuals, evaluation counts, candidate parameters, and status (`CONVERGED`, `ACCEPTABLE_CANDIDATE`, etc.). |
| **Calibration Acceptances** | `printhouse_pricing_calibration_acceptances` (DB) | Governed acceptance records verifying tolerance against canonical `@ppos/pricing-engine` buildPrice, inserting revisions and updating active node rates atomically. |
| **Pricing Reachability Service** | `src/api/services/calibrationReachabilityService.js` | Evaluates physical specification reachability against node machine capabilities before calibration. |
| **Inverse Pricing Solver** | `src/api/services/deterministicInversePricingSolver.js` | Deterministic binary search & coordinate refinement solver operating strictly in memory via `buildPriceCalibrationAdapter.js`. |
| **Governed Acceptance Service** | `src/api/services/calibrationAcceptanceService.js` | Server-side atomic transaction executing patch merging, BPE verification, tolerance validation, and DB updates. |
| **Pricing Governance Metadata** | `src/api/services/printhousePricingGovernanceService.js` | Read-only checksum-matching service resolving active revision ID and last verified manufacturing price. |
| **Calibration Assistant Service** | `src/api/services/calibrationAssistantService.js` | Conversational assistant extracting structured physical/commercial spec from user chat via `aiProviderAdapter.js`. |
| **UI: Pricing Workflow Selector** | `src/ui/components/printhouse/setup/PricingPanel.tsx` | Hub component hosting choices: Guided Quick Calibration vs Canonical Industrial Editor vs Revisions. |
| **UI: Quick Calibration Panel** | `src/ui/components/printhouse/pricing/quick-calibration/QuickCalibrationPanel.tsx` | Guided 4-step wizard with chat assistant, specification confirmation, inverse solver trigger, candidate review & acceptance. |
| **UI: Industrial Pricing Editor** | `src/ui/components/printhouse/pricing/CanonicalIndustrialPricingEditor.tsx` | Direct raw rates editor for printing managers. |
| **UI: Hawk-Eye Overview** | `src/ui/components/printhouse/pricing/PricingHawkEyePanel.tsx` | Truthful read-only overview showing rates completeness, coverage %, and active revision checksum status. |
| **API Routes** | `src/api/routes/printhousePricingRoutes.js` & `pricingAdmin.js` | REST API endpoints for sessions, runs, acceptances, revisions, and assistant chats. |

---

## 3. Reusable Components for Phase 194

1. **`buildPriceCalibrationAdapter.js`**: Forward pricing adapter executing canonical `@ppos/pricing-engine` in memory.
2. **`calibrationGovernanceTolerances.js`**: Governed tolerance calculator (`computeGovernanceTolerance`).
3. **`printhousePricingGovernanceService.js`**: Deterministic SHA-256 rates checksum generation (`computeRatesChecksum`).
4. **`calibrationAssistantService.js`**: Structural extraction pipeline and sanitization.
5. **`aiProviderAdapter.js`**: Abstracted AI LLM provider interface.
6. **`countryCatalog.js`**: ISO2 country validation for transport destination.

---

## 4. Architectural Gaps Found for Phase 194 Requirements

1. **Single-Target Session Restriction (194C)**:
   `calibration_sessions` currently holds a single `target_manufacturing_price` and a single `book_spec_json.copies`. It lacks a schema and solver support for multiple quantity target points (e.g. 500, 600, 700 copies) within the same session.
2. **Lack of Governed Quote Evidence Layer (194A)**:
   Quotation evidence is directly parsed into calibration inputs without a separate `quote_evidence` ingestion record verifying arithmetic consistency (`total == quantity * unit_price`, `total == manufacturing + transport`).
3. **No Non-Linear Quantity Economics Engine (194B)**:
   Rates in `@ppos/pricing-engine` use linear per-1000 and fixed setup components. Continuous piecewise marginal economics or quantity curve breakpoint rules (`PIECEWISE_MARGINAL`, digital ↔ offset transition breakpoints) are not currently defined as an explicit additive model layer.
4. **Missing Curve-Level Acceptance Checks (194D)**:
   Acceptance only evaluates single-point residual tolerance. It lacks curve-level monotonicity ($P(q_2) \ge P(q_1)$), unit cost direction ($P(q_2)/q_2 \le P(q_1)/q_1$), and marginal cost validity checks.
5. **PDF Ingestion & Storage Gap (194E)**:
   There is no file upload handler or PDF text extraction pipeline in `printhousePricingRoutes.js`.
6. **Single-Language Assistant Constraint (194F)**:
   Assistant system prompts and normalization logic are English-only. There is no multi-stage pipeline: `Detection -> Translation -> Normalization (GLOSSARY) -> Canonical JSON`.

---

## 5. Risks & Considerations

- **Governance Weakening**: High risk if quote extraction or AI assistant auto-commits rates changes without explicit operator review and governed acceptance tolerance checks.
- **Solver Overfitting**: Inverse solver must optimize against the full multi-quantity curve without overfitting to a single target point or creating non-monotonic price steps.
- **Arithmetic False Positives**: OCR/PDF extractions often have rounding discrepancies (e.g. 1473 / 250 = 5.892 vs printed 5.89). Arithmetic validation must classify exact match vs rounding delta vs true inconsistency.
- **Tenant Isolation**: Uploaded quote PDFs and extraction evidence must strictly belong to the uploading tenant ID.

---

## 6. Files Likely Affected in Phase 194

- `migrations/150_phase194_quantity_economics_and_quote_evidence.sql` (New)
- `src/api/services/quoteEvidenceService.js` (New)
- `src/api/services/quantityEconomicsService.js` (New)
- `src/api/services/printingTranslationService.js` (New)
- `src/api/services/deterministicInversePricingSolver.js` (Update for multi-target curve solving)
- `src/api/services/calibrationSessionService.js` (Update for multi-quantity targets & evidence links)
- `src/api/services/calibrationAcceptanceService.js` (Update for curve-level acceptance)
- `src/api/services/calibrationAssistantService.js` (Update for PDF extraction & multilingual translation)
- `src/api/routes/printhousePricingRoutes.js` (Mount PDF upload, evidence review, and multilingual chat endpoints)
- `src/ui/components/printhouse/pricing/quick-calibration/QuickCalibrationPanel.tsx` (UI for quote upload, evidence review modal, quantity curve display)
- `tests/smoke_phase194a_quote_evidence.js` through `tests/smoke_phase194h_acceptance.js` (New smoke test suite)
