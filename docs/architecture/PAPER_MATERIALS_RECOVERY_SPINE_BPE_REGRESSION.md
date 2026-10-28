# PAPER-MATERIALS-RECOVERY-03R — Spine Calculator, BPE, Tenant Isolation & Paper Materials Regression Report

**Mission:** `PAPER-MATERIALS-RECOVERY-03R`  
**Phase:** Phase 4 — Validación  
**Date:** 2026-10-28

---

## 1. Summary of Test Suites Executed

| Repository | Test Suite / Command | Assertions / Cases | Result |
| :--- | :--- | :---: | :---: |
| `ppos-control-plane` | `npx vitest run tests/paper_materials_recovery_03.test.js` | `14 / 14` | **PASS** |
| `ppos-control-plane` | `npx vitest run tests/paper_technical_import_and_catalog.test.js` | `20 / 20` (`23` DB-gated skipped) | **PASS** |
| `ppos-control-plane` | `npx vitest run tests/spine02_03_engine_and_api.test.js` | `27 / 27` | **PASS** |
| `ppos-control-plane` | `npx vitest run tests/paper_supplier_offers_and_catalog.test.js` | `16 / 16` (`27` DB-gated skipped) | **PASS** |
| `ppos-control-plane` | `npm run build` (`vite build`) | Production UI bundle | **PASS** (`5.97s`) |
| `ppos-control-plane` | `npm run migration:integrity` (`178` SQL migrations) | `Phase 183: PASSED` | **PASS** |
| `PrintPricePro_BookPrice` | `npx tsc --noEmit` | Full TypeScript typecheck | **PASS** (`0` errors) |
| `PrintPricePro_BookPrice` | `npm run build` | Production UI bundle | **PASS** (`6.07s`) |
| `PrintPricePro_BookPrice` | `node server/scripts/test_spine_04_integration.js` | `46 / 46` | **PASS** |
| `PrintPricePro_BookPrice` | `node server/scripts/verify_budget_01d_regression.js` | `10 / 10` | **PASS** |

---

## 2. Detailed Coverage of `tests/paper_materials_recovery_03.test.js` (`14/14 PASS`)

The dedicated test suite [`tests/paper_materials_recovery_03.test.js`](../../tests/paper_materials_recovery_03.test.js) verifies all invariants mandated in `PAPER-MATERIALS-RECOVERY-03` and `03R`:

1. **Multilingual Latvian/English `COAT` Normalization (`3` tests)**:
   - `krītots` / `2xkrītots` $\to$ `COATED` (`EXPLICIT_SOURCE`).
   - `vienpus. krītots` / `Krītots 1s` / `GC1` $\to$ `ONE_SIDE_COATED` (`EXPLICIT_SOURCE`).
   - `nekrītots` $\to$ `UNCOATED` (`EXPLICIT_SOURCE`).
   - `pusglancēts` / `semigloss` $\to$ `SEMI_GLOSS`, and `Kappa` $\to$ `CARTON` + `UNCOATED`.
2. **Finish vs Coating Separation & Conflict Detection (`5` tests)**:
   - `PAPER TYPE = Matt` + `COAT = nekrītots` (`Munken Polar 240`, `LuxCream 1.8 90g`, `Munken Pure Rough 100`) $\to$ resolved to `coatingStatus = UNCOATED` (never `COATED`) and flagged with `SOURCE_TYPE_MATT_WITH_NEKRITOTS_COAT`.
   - `PAPER TYPE = Silk` + `krītots` with `Gloss` in product name (`Galerie Art Gloss`, `Maxi Gloss`) $\to$ resolved to `finish = GLOSS` and flagged with `PT_SILK_WITH_GLOSS_PRODUCT_NAME`.
   - `PAPER TYPE = Matt` + `COAT = silk` (`Arctic Volume ice 130`, `Arctic Volume White 200`) $\to$ flagged with `PT_MATT_WITH_COAT_SILK_CONFLICT`.
   - `Jautāt` ("Ask") and missing `COAT` without family rule $\to$ `coatingStatus = UNKNOWN`, `finish = UNKNOWN`.
   - Zero grain inference: `70x100` and `100x70` ODS rows without explicit grain tags always resolve to `grainDirection = UNKNOWN`.
3. **Elimination of Synthetic `UNKNOWN · UNCOATED` & Strict Exclusion of Review/Conflict Rows (`4` tests)**:
   - Verifies that `resolveVariantTechnicalAttributes` resolves `ods_materials_recovery` on the `943` `SAFE_UNIQUE_MATCH` rows.
   - Verifies that excluded review/conflict rows (`501` `STRONG_MATCH_REVIEW`, `62` `ATTRIBUTE_CONFLICT`, `16` `AMBIGUOUS_MATCH` which only have `ods_caliper_recovery`) are **never** auto-converted into verified attributes at runtime, while their synthetic `OTHER + UNCOATED` default is cleanly converted to `UNKNOWN`.
   - Verifies that accredited demo variants (`LONG_GRAIN` / `SHORT_GRAIN`) are preserved.
4. **Deterministic Reconciliation Categories (`1` test)**:
   - Verifies exact routing of all `1,524` production variants into `SAFE_UNIQUE_MATCH` (`943`), `STRONG_MATCH_REVIEW` (`501`), `ATTRIBUTE_CONFLICT` (`62`), `AMBIGUOUS_MATCH` (`16`), `ALREADY_VERIFIED` (`2`), and `UNMATCHED` (`0`).
5. **Spine Calculator & Caliper Provenance Compatibility (`1` test)**:
   - Verifies that `caliper_um`, `caliper_source`, and `caliper_confidence_status` remain `100%` intact alongside `resolveVariantTechnicalAttributes`.


---

## 3. Spine Calculator & BPE Regression Verification

### 3.1. Spine Engine Authority & Geometry (`tests/spine02_03_engine_and_api.test.js` — `46/46 PASS`)
- Verified softcover glued, softcover sewn, and hardcover casebound formulas (`leaves`, `paperBlockThicknessMm`, `gluedSpineMm`, `sewnSpineMm`, `caseboardThicknessMm`, `hingeAllowanceMm`, `turnInMm`, `flatCoverWidthMm`, `flatCoverHeightMm`).
- Verified server-side authority: client discrepancies on `caliper_um` or `gsm` are rejected (`409 SPINE_CLIENT_DISCREPANCY_REJECTED`), and variants without approved caliper return `SPINE_CALIPER_REQUIRED`.

### 3.2. Budget App Spine Integration (`test_spine_04_integration.js` — `46/46 PASS`)
- Verified `spineService.ts` contract, state mapping (`INDUSTRIAL_CERTIFIED`, `CALCULATED_UNCERTIFIED`, `CALIPER_REQUIRED`), custom format propagation, and strict separation between mathematical validity and industrial certification.

### 3.3. BPE Pricing & Imposition Regression (`verify_budget_01d_regression.js` — `10/10 PASS`)
- Verified that enriching technical attributes (`paperType`, `coatingStatus`, `finish`, `grainDirection`, `originalCode`) in the catalog API payload has **zero drift (`0.00 EUR`)** on Book Pricing Engine (BPE) imposition, waste, press selection, or commercial quote pricing.

