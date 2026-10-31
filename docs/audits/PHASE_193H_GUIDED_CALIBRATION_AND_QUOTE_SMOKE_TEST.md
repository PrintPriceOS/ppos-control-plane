# IMPLEMENTATION PLAN: PHASE 193H — GUIDED CALIBRATION UX & GOVERNED QUOTE SMOKE TEST

## 1. Goal Description

Transform the Printhouse Pricing Onboarding experience from an internally structured technical form into an intuitive, non-technical guided wizard ("Describe a real job" → "We understood this" → "What did this job cost you?" → "Calibrate" → "Test your pricing") and introduce a capability-aware **Governed Quote Smoke Test** (`/api/printhouse/onboarding/pricing/quote-preview`) that executes the canonical `@ppos/pricing-engine` `buildPrice()` pipeline.

---

## 2. Architectural Audit & Codebase Findings

1. **Pricing Preview Endpoint**:
   - Currently, `/api/printhouse/onboarding/pricing/preview` exists only for commercial price-book rules simulation.
   - For industrial physical quote preview, `buildPriceCalibrationAdapter.evaluateForwardPrice(bookSpec, ratesSnapshot, {}, nodeConfig)` already encapsulates `@ppos/pricing-engine buildPrice(bpeParams, syntheticHouse)` with line item and debug component decomposition.
   - We will introduce a clean, read-only canonical endpoint:
     `POST /api/printhouse/onboarding/pricing/quote-preview`
     which extracts current active `printer_nodes.rates_json`, node capabilities, lead times, and shipping regions, delegating 100% of price calculation to `buildPriceCalibrationAdapter.evaluateForwardPrice()`.

2. **Zero-Write & Zero-Arithmetic Invariants**:
   - `POST /pricing/quote-preview` will be strictly read-only: zero rates mutations, zero session creations, zero orders/jobs created.
   - The React UI will perform **zero** math or total derivations; it renders strictly the decomposition returned by the server.

3. **Capability Filtering**:
   - The smoke test configurator dynamically filters options (print modes, paper grammages, binding methods, lamination, delivery regions) based on the printer node configuration and active shipping regions (`printhouseShippingRoutes.js`).

---

## 3. Proposed UX Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             PRICING SETUP                                  │
│  [✓ Manufacturing]  [✓ Materials]  [✓ Commercial]  [✓ Shipping]  [✓ Quote]  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     GUIDED WIZARD (Default Mode)                            │
│                                                                             │
│  STEP 1: Tell us about a real job you've produced (Natural language / AI)   │
│  STEP 2: We understood this (Human-readable review card)                    │
│  STEP 3: What did this job cost you to manufacture? (€ + Inclusions)        │
│  STEP 4: [ Use this job to calibrate my pricing ]                           │
│  STEP 5: Test your pricing (Canonical BPE quote smoke test)                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
               (Expandable)           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                ADVANCED / MANUAL PRICING CONFIGURATION                      │
│  - Raw Physical Book Specification & Provenance Badges                      │
│  - Mathematical Residual & Solver Identifiability Breakdown                 │
│  - Proposed Rate Paths & Grouped Rate Comparison Matrix                     │
│  - Canonical Industrial Manufacturing Pricing Editor (rates_json)           │
│  - Pricing Revision History Ledger                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Proposed Changes

### Backend Components

#### [NEW] `src/api/services/quotePreviewService.js`
- Loads tenant's printer node (`rates_json`, `signatures`, `production_lead_days`, `delivery_time`, `limits`).
- Loads active shipping regions for country validation and transit times.
- Evaluates complete forward price using `buildPriceCalibrationAdapter.evaluateForwardPrice()`.
- Returns structured, user-safe decomposition:
  - `manufacturingCost`
  - `finishingCost`
  - `bindingCost`
  - `packagingCost`
  - `transportCost`
  - `commercialMarkup`
  - `totalPrice`
  - `unitPrice`
  - `estimatedProductionLeadDays`
  - `estimatedDeliveryDays`
  - `configurationStatus` (which capabilities were active, missing config warnings)

#### [MODIFY] `src/api/routes/printhouseOnboardingRoutes.js`
- Mounts `POST /api/printhouse/onboarding/pricing/quote-preview` with `requireAuth`.
- Tenant ID derived exclusively from JWT.

---

### Frontend Components

#### [NEW] `src/ui/components/printhouse/pricing/quick-calibration/GuidedCalibrationWizard.tsx`
- Step-by-step guided stepper:
  - Step 1: Conversational prompt / assistant input.
  - Step 2: "We understood this" summary card with `[ Edit details ]` and `[ Looks right ]`.
  - Step 3: Plain-language manufacturing cost and checklist of inclusions.
  - Step 4: Calibration execution and governed acceptance.
  - Step 5: Direct transition to "Test your pricing".
- Collapsible "Advanced Details" drawer containing full technical tables and rate cards.

#### [NEW] `src/ui/components/printhouse/pricing/quick-calibration/GovernedQuoteSmokeTest.tsx`
- Capability-aware mini-configurator (Copies, Size, Pages, Print, Paper, Cover, Lamination, Binding, Destination).
- Invokes `printhouseCalibrationApi.previewQuote()`.
- Renders server-calculated breakdown with "How was this price calculated?" trace drawer.
- Shows missing configuration alerts (e.g., "Shipping region not configured") instead of dummy defaults.

#### [MODIFY] `src/ui/components/printhouse/pricing/quick-calibration/QuickCalibrationPanel.tsx`
- Hosts the Guided Wizard as the default view.
- Provides progressive disclosure for advanced calibration metrics.

#### [MODIFY] `src/ui/lib/printhouseCalibrationApi.ts`
- Adds `previewQuote(payload)` calling `POST /pricing/quote-preview`.

---

## 5. Verification Plan

### Automated Tests
1. **`tests/smoke_phase193h_guided_calibration_and_quote_smoke_test.js`**:
   - `H1`–`H5`: Guided wizard stepper and progressive disclosure without losing manual fallback.
   - `H6`–`H10`: `POST /pricing/quote-preview` endpoint execution, zero-write guarantee (no DB mutations, no orders created).
   - `H11`–`H15`: Direct delegation to `@ppos/pricing-engine` `buildPrice()`, accurate decomposition matching canonical BPE output.
   - `H16`–`H20`: Capability constraints and missing config warnings.
2. Full suite regressions:
   - `node tests/smoke_phase193f_quick_calibration_ui.js`
   - `node tests/smoke_phase193e_conversational_assistant.js`
   - `node tests/smoke_phase193d_governed_acceptance.js`
   - `node tests/smoke_phase193c_inverse_solver.js`
   - `node tests/smoke_phase193b_calibration_foundation.js`
   - `scripts/smoke_phase183_migration_integrity.js`
   - RC20 suites & `npm run build`.
