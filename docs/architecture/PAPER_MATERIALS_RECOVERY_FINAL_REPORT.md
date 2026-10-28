# PAPER-MATERIALS-RECOVERY-03 — Final Executive Report & Quantified Reconciliation Dictamen

**Mission:** `PAPER-MATERIALS-RECOVERY-03 — Recuperación integral de atributos técnicos — PrintPrice OS`  
**Primary Repository:** `PrintPriceOS/ppos-control-plane` (`feat/paper-materials-recovery-03`)  
**Consumer Repository:** `PrintPriceOS/PrintPricePro_BookPrice`  
**Production Environment:** `212.227.79.67` (`Control` MySQL database)  
**Final Verdict:** **`PAPER_MATERIALS_RECOVERY_03_READY_FOR_APPROVAL`**

---

## 1. Executive Summary

We have completed the comprehensive audit, multilingual normalization engineering, deterministic 1:1 reconciliation, pre-update production backup, API/UI hardening, and automated regression verification for all **`1,524` production variants** in `Control.paper_variants` / `Control.paper_products` against the original supplier source `Paper data base.ods.zip` (`1,573` rows).

In strict compliance with **Phase 6** of the mission order (*"La autorización de esta misión comprende implementación y preparación de actualizaciones, pero **no autoriza una escritura masiva de atributos nuevos hasta disponer de un informe cuantificado de coincidencias únicas y conflictos**"*):
1. All normalization services, reconciliation scripts, API serializers, UI components, and tests are implemented and verified.
2. Full pre-update backups and in-DB clone tables (`paper_products_backup_rec03_20261028`, `paper_variants_backup_rec03_20261028`) are created and verified on `212.227.79.67` under `/opt/printprice-os/backups/paper-materials-recovery-03/`.
3. **No mass write of the new technical attributes has been executed yet on production**; the exact quantified plan is presented below for explicit approval.

---

## 2. Direct Answers to Mission Audit Questions

### Q1. Why were `1,097` variants displaying `UNKNOWN · UNCOATED` in Paper Materials?
- **Exact Cause**: In [`SupplierCatalogOffersPage.tsx`](../../src/ui/pages/supplier/SupplierCatalogOffersPage.tsx), the subtitle rendered `{offer.grainDirection} · {offer.finish}`.
  - `UNKNOWN` was `paper_variants.grain_direction` (`1,522 / 1,524` rows had `grain_direction = 'UNKNOWN'` because `Paper data base.ods.zip` has no grain column).
  - `UNCOATED` was `paper_variants.finish` (`1,097 / 1,524` rows had `finish = 'UNCOATED'` and `paper_products.coating_status = 'UNCOATED'`).
  - During the original 4-column CSV batch import (`product_name, gsm, sheet_size, price_per_ton`), `paper_supplier_schema_compatible_batches.zip` dropped the ODS columns `PAPER TYPE`, `COAT`, `Thickness`, `CODE`, and `SORTIMENT`. When [`paperImportService.js`](../../src/api/services/paperImportService.js) imported those 4-column CSVs, `inferFinish()` and `inferCoatingStatus()` fell back to `'UNCOATED'` (`and paper_type = 'OTHER'`) for every product whose commercial name did not literally contain `silk`, `gloss`, `matt`, or `coated` (`1,024` variants).
- **Remediation**:
  - Removed the `'UNCOATED'` fallback in `paperImportService.js`, `paperProcurementService.js`, and `paperOfferService.js`.
  - Implemented `resolveVariantTechnicalAttributes()` in [`paperMaterialsNormalizationService.js`](../../src/api/services/paperMaterialsNormalizationService.js) to strip synthetic `OTHER + UNCOATED + UNKNOWN` defaults and resolve verified attributes.
  - Updated `SupplierCatalogOffersPage.tsx` (`ES`/`EN`/`DE`) and `AdvancedPaperSelector.tsx` so `UNKNOWN · UNCOATED` is never rendered.

### Q2. What attributes exist in `Paper data base.ods.zip` (`1,573` rows) vs `paper_supplier_schema_compatible_batches.zip` (`1,544` + `29` rows)?
- **`Paper data base.ods.zip` (`12` columns)**:
  - `CODE` (`1,397` populated / `176` empty)
  - `NAME` (`1,573` populated)
  - `WIDTH (mm)` & `Heights (mm)` (`1,573` populated; stored in cm for values `< 200` and mm for `16` rows $\ge 200$)
  - `GRAMS` (`1,573` populated)
  - `PAPER TYPE` (`1,573` populated: `Silk` [`420`], `Matt` [`330`], `Dizaina` [`306`], `Ofset` [`264`], `Kartons` [`175`], `Uzlīmju` [`23`], `Paškopējošais` [`19`], `Kappa` [`10`], `Group 1` [`10`], `Avīžpapīrs` [`9`], `Kraft` [`5`], `Gloss` [`1`], `Plotter` [`1`])
  - `COAT` (`1,176` populated / `397` empty: `krītots` [`726`], `nekrītots` [`351`], `Jautāt` [`31`], `dizaina`/`Dizaina` [`21`], `1xkrītots` [`19`], brand/shade strings [`21`], `2xkrītots` [`3`], `silk` [`2`], `kritots/nekritot` [`1`], `POLAP` [`1`], `70` [`1`], `mitrumizturīgs` [`1`], `caurspīdīgs` [`1`], `Sintētiskais` [`1`])
  - `SORTIMENT` (`1,390` populated / `183` empty)
  - `Price Tone` / `1000 Sheet` (`1,573` populated)
  - `PROVISER` (`1,573` populated: `Antalis` [`814`], `Papyrus` [`542`], `Igepa` [`140`], `Polap` [`56`], `PG` [`21`])
  - `Thickness` (`1,557` numeric $\mu\text{m}$ / `16` `#N/A`)
- **`paper_supplier_schema_compatible_batches.zip` (`4` columns)**:
  - Retained only `product_name`, `gsm`, `sheet_size`, `price_per_ton` (dropping `CODE`, `PAPER TYPE`, `COAT`, `SORTIMENT`, `PROVISER`, and `Thickness`).

### Q3. Can `grain_direction` (`LONG_GRAIN` / `SHORT_GRAIN`) be recovered from `Paper data base.ods.zip`?
- **No (`0` ODS rows have explicit grain)**. Neither `Paper data base.ods.zip` nor `paper_supplier_schema_compatible_batches.zip` contains a grain direction column, and sheet dimensions (`70x100` vs `100x70`) cannot be treated as accredited grain without mill/supplier confirmation.
- All `1,522` ODS-derived variants remain `grain_direction = 'UNKNOWN'` (rendered cleanly in UI as *"Grain no especificado"* / *"Grain unspecified"* / *"Laufrichtung nicht angegeben"*), while the `2` demo variants (`var_9cd7c29f956dc9e0` `LONG_GRAIN` and `var_035cb8ab7cd3fa7e` `SHORT_GRAIN`) preserve their accredited grain.

---

## 3. Quantified Reconciliation of the `1,524` Production Variants

Every single non-demo variant in production (`1,522 / 1,522`) matched its source tuple in `Paper data base.ods.zip` (`0` unmatched). Full row-by-row details are in [`PAPER_MATERIALS_RECOVERY_MATCH_MATRIX.csv`](./PAPER_MATERIALS_RECOVERY_MATCH_MATRIX.csv).

| Reconciliation Category | Variants | % of Catalog | Description & Breakdown |
| :--- | :---: | :---: | :--- |
| **`SAFE_UNIQUE_MATCH`** | **`943`** | **`61.88%`** | Unique 1:1 tuple match `(product_name, gsm, width_mm, height_mm)` with explicit, non-conflicting `PAPER TYPE` and `COAT` (`krītots`, `nekrītots`, `1xkrītots`, `2xkrītots`). Ready for immediate automatic update. |
| **`STRONG_MATCH_REVIEW`** | **`501`** | **`32.87%`** | Unique 1:1 tuple match with family-inferred or product-name-refined attributes:<br>• `102` variants: `PAPER TYPE = Silk` + `COAT = krītots` where product name explicitly says `Gloss` (`Galerie Art Gloss`, `Maxi Gloss`, `Galerie Fine Gloss`) $\to$ `COATED` + `GLOSS`.<br>• `138` variants: `PAPER TYPE = Dizaina` with empty/brand `COAT` on verified uncoated mill lines (`Munken`, `Olin`, `Pergraphica`, `Scandia 2000`, `Splendorgel`, `Rives`, `Keaykolour`, `Curious Metallics`, `Mohawk`, `Arena`, `Sirio`, `Conqueror`, `Wild`, `PlanoPlus`) $\to$ `DESIGN` + `UNCOATED`.<br>• `70` variants: `PAPER TYPE = Ofset` with empty `COAT` (`Amber Graphic`, `Maestro Print`, `Munken Print`, `Holmen Book`, `Preprint`, `Soporset`) $\to$ `OFFSET` + `UNCOATED`.<br>• `63` variants: `PAPER TYPE = Matt` with empty `COAT` on verified coated matt lines (`G-Print`, `Galerie Art Matt`, `Galerie Fine`, `MultiArt Matt`, `Maxi Matt`, `LumiMatt`, `Creator Vol`, `Quatro`, `Arctic Matt`, `Tom&Otto Matt`) $\to$ `COATED` + `MATT`.<br>• `47` variants: `PAPER TYPE = Silk` with empty `COAT` on verified coated lines $\to$ `COATED` + `SILK` (`39`), `GLOSS` (`7`), `MATT` (`1`).<br>• `10` variants: `PAPER TYPE = Kappa` greyboard (`Eskaboard`) $\to$ `CARTON` + `UNCOATED`.<br>• `7` variants: `PAPER TYPE = Kartons` with `1S`/`GC1`/`GC2` (`Ensocoat 1s`, `Arktika`, `Incada`, `Tambrite`, `Carta Integra`, `Chromocard`, `Algro Design 1S`) $\to$ `CARTON` + `ONE_SIDE_COATED`.<br>• `1` variant: `PAPER TYPE = Dizaina` with `semigloss` (`Teknocard`) $\to$ `DESIGN` + `SEMI_GLOSS`.<br>• `84` variants: `COAT` empty on specialty `Dizaina` (`46`), `Kartons` (`35`), or `Group 1` (`3`) where coating cannot be inferred $\to$ `coatingStatus = UNKNOWN`, `finish = UNKNOWN` (clears false `UNCOATED`). |
| **`ATTRIBUTE_CONFLICT`** | **`62`** | **`4.07%`** | Unique 1:1 tuple match with conflicting source tokens in ODS:<br>• `31` variants: `COAT = "Jautāt"` ("Ask").<br>• `21` variants: `COAT = "dizaina"` / `"Dizaina"` on covering materials (`Geltex`, `Wibalin`, `Surbalin`, `Pergraphica Infinite Black`).<br>• `2` variants: `PAPER TYPE = Matt` vs `COAT = nekrītots` (`LuxCream 1.8 90g 64x90`, `Munken Polar 240 72x102 FSC`).<br>• `2` variants: `PAPER TYPE = Matt` vs `COAT = silk` (`Arctic Volume ice 130 72x102 FSC`, `Arctic Volume White 200 102x72 FSC`).<br>• `1` variant each: `kritots/nekritot` (`Algro Design Duo 330`), `POLAP` (`Maestro Print 140`), `70` (`Umka Color 350`), `mitrumizturīgs` (`Chantaffiche 250JE Blueback 115g`), `caurspīdīgs` (`Curious Translucents 210g`), `Sintētiskais` (`Syn-Coat 175g`), and `Geltex LS` in `Ofset` (`1`). |
| **`AMBIGUOUS_MATCH`** | **`16`** | **`1.05%`** | Duplicate tuples (`2` rows each in ODS = `32` ODS rows): `6` `Efalin FINE LINEN`, `1` `Maestro Print 170`, `1` `Maxi Satin 115`, `1` `Munken Polar 300`, `2` `Munken Print Cream 15`, `1` `Munken Print White 15`, `4` `Munken Pure Rough`. |
| **`ALREADY_VERIFIED`** | **`2`** | **`0.13%`** | Accredited demo rows (`var_9cd7c29f956dc9e0` `LONG_GRAIN`, `var_035cb8ab7cd3fa7e` `SHORT_GRAIN`). |
| **`UNMATCHED`** | **`0`** | **`0.00%`** | Zero unmatched variants. |
| **TOTAL** | **`1,524`** | **`100.00%`** | Complete production catalog accounted for. |

---

## 4. Proposed Distribution of Canonical Attributes After Applying Tier 1 + Tier 2 (`1,444` Variants)

| Attribute | Current Production DB (`1,524` Variants) | Proposed After Recovery (`1,524` Variants) | Key Improvement |
| :--- | :--- | :--- | :--- |
| **`paperType`** | `OTHER`: `1,024`<br>`COATED`: `427`<br>`OFFSET`: `73` | `COATED`: `764`<br>`DESIGN`: `301`<br>`OFFSET`: `259`<br>`CARTON`: `147`<br>`OTHER`: `53` | Reclassifies `971` false `OTHER` variants into their true industrial families (`COATED`, `DESIGN`, `OFFSET`, `CARTON`). |
| **`coatingStatus`** | `UNCOATED`: `1,097`<br>`COATED`: `427` | `COATED`: `736`<br>`UNCOATED`: `564`<br>`ONE_SIDE_COATED`: `35`<br>`UNKNOWN`: `189` | Eliminates `533` false `UNCOATED` defaults (`309` become `COATED`, `35` become `ONE_SIDE_COATED`, `189` unverified/specialty become explicit `UNKNOWN`). |
| **`finish`** | `UNCOATED`: `1,097`<br>`MATT`: `250`<br>`SILK`: `113`<br>`GLOSS`: `64` | `UNCOATED`: `555`<br>`MATT`: `345`<br>`SILK`: `311`<br>`GLOSS`: `110`<br>`SEMI_GLOSS`: `1`<br>`OTHER`: `39`<br>`UNKNOWN`: `163` | Recovers `95` `MATT`, `198` `SILK`, and `46` `GLOSS` variants previously hidden under `UNCOATED`, and marks `163` unverified specialty items as `UNKNOWN`. |
| **`grainDirection`** | `UNKNOWN`: `1,522`<br>`LONG_GRAIN`: `1`<br>`SHORT_GRAIN`: `1` | `UNKNOWN`: `1,522`<br>`LONG_GRAIN`: `1`<br>`SHORT_GRAIN`: `1` | Zero grain hallucination; UI renders localized *"Grain no especificado"* instead of raw `UNKNOWN`. |
| **`caliper_um`** | Approved numeric $\mu\text{m}$: `1,508`<br>`NULL` (`UNKNOWN`): `16` | Approved numeric $\mu\text{m}$: `1,508`<br>`NULL` (`UNKNOWN`): `16` | `100%` preserved from `PAPER-CALIPER-RECOVERY-02` (`0` caliper discrepancies). |

---

## 5. Deliverables Index

1. [`docs/architecture/PAPER_MATERIALS_RECOVERY_SOURCE_AUDIT.md`](./PAPER_MATERIALS_RECOVERY_SOURCE_AUDIT.md) — Complete source comparison (`Paper data base.ods.zip` vs `paper_supplier_schema_compatible_batches.zip` vs Livonia vs production MySQL `Control`).
2. [`docs/architecture/PAPER_MATERIALS_RECOVERY_NORMALIZATION_RULES.md`](./PAPER_MATERIALS_RECOVERY_NORMALIZATION_RULES.md) — Multilingual Latvian/English normalization rules and non-hallucination invariants.
3. [`docs/architecture/PAPER_MATERIALS_RECOVERY_MATCH_MATRIX.csv`](./PAPER_MATERIALS_RECOVERY_MATCH_MATRIX.csv) — Full `1,524`-row deterministic reconciliation matrix.
4. [`docs/architecture/PAPER_MATERIALS_RECOVERY_UNKNOWN_UNCOATED_AUDIT.md`](./PAPER_MATERIALS_RECOVERY_UNKNOWN_UNCOATED_AUDIT.md) — Root-cause analysis and remediation of `UNKNOWN · UNCOATED`.
5. [`docs/architecture/PAPER_MATERIALS_RECOVERY_MIGRATION_PLAN.md`](./PAPER_MATERIALS_RECOVERY_MIGRATION_PLAN.md) — Production backup manifest (`/opt/printprice-os/backups/paper-materials-recovery-03/`), checksums, update commands, and 1-step SQL rollback.
6. [`docs/architecture/PAPER_MATERIALS_RECOVERY_SPINE_BPE_REGRESSION.md`](./PAPER_MATERIALS_RECOVERY_SPINE_BPE_REGRESSION.md) — Automated test and regression verification across Control Plane and Budget App.
7. [`docs/architecture/PAPER_MATERIALS_RECOVERY_FINAL_REPORT.md`](./PAPER_MATERIALS_RECOVERY_FINAL_REPORT.md) — This executive report.

---

## 6. Final Verdict

**`PAPER_MATERIALS_RECOVERY_03_READY_FOR_APPROVAL`**
