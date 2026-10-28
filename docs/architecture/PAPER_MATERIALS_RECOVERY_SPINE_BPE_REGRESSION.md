# PAPER-MATERIALS-RECOVERY-03 — Spine Calculator, BPE & Paper Materials Regression Report

**Mission:** `PAPER-MATERIALS-RECOVERY-03`  
**Phase:** Phase 9 — Pruebas obligatorias y regresión  
**Date:** 2026-10-28

---

## 1. Summary of Test Suites Executed

| Repository | Test Suite / Command | Assertions / Cases | Result |
| :--- | :--- | :---: | :---: |
| `ppos-control-plane` | `npx vitest run tests/paper_materials_recovery_03.test.js` | `13 / 13` | **PASS** |
| `ppos-control-plane` | `npx vitest run tests/paper_technical_import_and_catalog.test.js` | `13 / 13` | **PASS** |
| `ppos-control-plane` | `npx vitest run tests/spine02_03_engine_and_api.test.js` | `46 / 46` | **PASS** |
| `ppos-control-plane` | `npx vitest run tests/paper_supplier_offers_and_catalog.test.js` | `4 / 4` (`50` DB-gated skipped) | **PASS** |
| `ppos-control-plane` | `npm run build` (`vite build`) | Production UI bundle | **PASS** (`5.97s`) |
| `ppos-control-plane` | `npm run migration:integrity` (`178` SQL migrations) | `Phase 183: PASSED` | **PASS** |
| `PrintPricePro_BookPrice` | `npx tsc --noEmit` | Full TypeScript typecheck | **PASS** (`0` errors) |
| `PrintPricePro_BookPrice` | `npm run build` | Production UI bundle | **PASS** (`6.07s`) |
| `PrintPricePro_BookPrice` | `node server/scripts/test_spine_04_integration.js` | `46 / 46` | **PASS** |
| `PrintPricePro_BookPrice` | `node server/scripts/verify_budget_01d_regression.js` | `10 / 10` | **PASS** |

---

## 2. Detailed Coverage of `tests/paper_materials_recovery_03.test.js` (`13/13 PASS`)

The dedicated test suite [`tests/paper_materials_recovery_03.test.js`](../../tests/paper_materials_recovery_03.test.js) verifies all invariants mandated in Phases 2, 3, 4, 7, and 9:

1. **Multilingual Latvian/English `COAT` Normalization (`4` tests)**:
   - `krītots` / `2xkrītots` $\to$ `COATED` (`EXACT_SOURCE`).
   - `1xkrītots` $\to$ `ONE_SIDE_COATED` (`EXACT_SOURCE`).
   - `nekrītots` $\to$ `UNCOATED` (`EXACT_SOURCE`).
   - `Jautāt` ("Ask"), `dizaina`, `kritots/nekritot`, `POLAP`, `70`, `mitrumizturīgs`, `caurspīdīgs`, `Sintētiskais` $\to$ flagged with `CONFLICT` confidence and explicit conflict reasons (`COAT_ASK_SUPPLIER_JAUTAT`, `COAT_DESIGN_COVERING_MATERIAL`, etc.); never silently converted to `UNCOATED`.
2. **Finish vs Coating Separation & Conflict Detection (`3` tests)**:
   - `PAPER TYPE = Matt` + `COAT = nekrītots` (`Munken Polar 240`, `LuxCream 1.8 90g`, `Munken Pure Rough 100`) $\to$ resolved to `coatingStatus = UNCOATED` (never `COATED`) and flagged with `MATT_TYPE_WITH_UNCOATED_COAT`.
   - `PAPER TYPE = Silk` + `krītots` with `Gloss` in product name (`Galerie Art Gloss`, `Maxi Gloss`) $\to$ resolved to `finish = GLOSS` and flagged with `SILK_TYPE_WITH_GLOSS_PRODUCT_NAME`.
   - `PAPER TYPE = Matt` + `COAT = silk` (`Arctic Volume ice 130`, `Arctic Volume White 200`) $\to$ flagged with `MATT_TYPE_WITH_SILK_COAT`.
3. **Zero Grain Hallucination (`1` test)**:
   - Verifies that `70x100` and `100x70` ODS rows without explicit grain tags always resolve to `grainDirection = UNKNOWN`, while explicit `LG` / `SG` / `LONG_GRAIN` / `SHORT_GRAIN` strings are preserved.
4. **Elimination of Synthetic `UNKNOWN · UNCOATED` Fallback (`2` tests)**:
   - Verifies that `resolveVariantTechnicalAttributes` strips synthetic `OTHER + UNCOATED + UNKNOWN` defaults on unverified rows and dynamically recovers `paperType`, `coatingStatus`, `finish`, and `originalCode` from `metadata_json.ods_caliper_recovery` / `metadata_json.ods_materials_recovery`.
5. **Deterministic Reconciliation Categories (`3` tests)**:
   - Verifies exact routing into `SAFE_UNIQUE_MATCH`, `STRONG_MATCH_REVIEW`, `ATTRIBUTE_CONFLICT`, `AMBIGUOUS_MATCH`, `ALREADY_VERIFIED`, and `UNMATCHED`, plus dimension normalization (`70x100` cm and `700x1000` mm $\to$ `700x1000` mm).

---

## 3. Spine Calculator & BPE Regression Verification

### 3.1. Spine Engine Authority & Geometry (`tests/spine02_03_engine_and_api.test.js` — `46/46 PASS`)
- Verified softcover glued, softcover sewn, and hardcover casebound formulas (`leaves`, `paperBlockThicknessMm`, `gluedSpineMm`, `sewnSpineMm`, `caseboardThicknessMm`, `hingeAllowanceMm`, `turnInMm`, `flatCoverWidthMm`, `flatCoverHeightMm`).
- Verified server-side authority: client discrepancies on `caliper_um` or `gsm` are rejected (`409 SPINE_CLIENT_DISCREPANCY_REJECTED`), and variants without approved caliper return `SPINE_CALIPER_REQUIRED`.

### 3.2. Budget App Spine Integration (`test_spine_04_integration.js` — `46/46 PASS`)
- Verified `spineService.ts` contract, state mapping (`INDUSTRIAL_CERTIFIED`, `CALCULATED_UNCERTIFIED`, `CALIPER_REQUIRED`), custom format propagation, and strict separation between mathematical validity and industrial certification.

### 3.3. BPE Pricing & Imposition Regression (`verify_budget_01d_regression.js` — `10/10 PASS`)
- Verified that enriching technical attributes (`paperType`, `coatingStatus`, `finish`, `grainDirection`, `originalCode`) in the catalog API payload has **zero drift (`0.00 EUR`)** on Book Pricing Engine (BPE) imposition, waste, press selection, or commercial quote pricing.
