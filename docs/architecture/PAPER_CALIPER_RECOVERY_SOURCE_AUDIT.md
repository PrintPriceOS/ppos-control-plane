# PAPER-CALIPER-RECOVERY-02 — Source Audit & Root-Cause Analysis

- **Mission**: `PAPER-CALIPER-RECOVERY-02`
- **Repository**: `PrintPriceOS/ppos-control-plane`
- **Production Database**: MySQL `Control` (`212.227.79.67`)
- **Date**: 2026-10-28

---

## 1. Audited Reference Artifacts & Cryptographic Fingerprints

| Artifact | Path / Table | Rows | SHA-256 / Checksum | Role |
| --- | --- | --- | --- | --- |
| `Paper data base.ods.zip` (`Paper data base.ods`, `Sheet1`) | `C:\Users\KIKE\Downloads\Paper data base.ods.zip` | `1,573` data rows | `7ffb63eb2705fa0c6faa459001ddd3db0702aa25d0bca52fa58e1a13899d4c9a` | Authoritative original supplier spreadsheet containing `MIKRONS` and `THICKNESS (mm)` |
| `catalog_compatible_all.csv` | `paper_supplier_schema_compatible_batches.zip` | `1,544` data rows | `3a7bf5fa9365865309b2805992b8b1ae03400353b6c5ed18d66bd7ac0ade6b38` | 4-column CSV batch (`product_name,gsm,width_mm,height_mm`) used to import `paper_products` and `paper_variants` |
| `references_need_review.csv` | `paper_supplier_schema_compatible_batches.zip` | `29` data rows | `a9a79deeb93706604034b2bdc4929e08a01f4fd77e091ea46ca4703db141a215` | 29 ODS rows excluded prior to catalog import due to missing/0 gsm or anomalous dimensions |
| `paper_technical_caliper_reference` | MySQL `Control.paper_technical_caliper_reference` | `375` rows | MySQL Checksum `2847849606` | Livonia Print technical caliper reference library (Migration `172`) |

---

## 2. Root-Cause Diagnosis: Why 1,512 Production Variants Had `caliper_um = NULL`

1. **Original Supplier Source (`Paper data base.ods.zip`)**:
   - Contains `1,573` data rows (XML rows `5` through `1577`) across 18 columns:
     `CODE`, `QR`, `NAME`, `PRICE`, `MIKRONS`, `THICKNESS (mm)`, `FORMAT`, `GRAMS`, `(empty)`, `COAT`, `Min. QUANTITY`, `STEPS/UNITS`, `SORTIMET`, `WIDTH (mm)`, `Heights (mm)`, `PAPER TYPE`, `PROVISER`, `AKTIV`.
   - Of those `1,573` rows, **`1,201` rows** carry positive caliper measurements in both `MIKRONS` and `THICKNESS (mm)`, while **`372` rows** have `0` or empty caliper values.
2. **Pre-Import Schema-Compatible Batch Transformation (`paper_supplier_schema_compatible_batches.zip`)**:
   - When `Paper data base.ods.zip` (`1,573` rows) was converted into `catalog_compatible_all.csv` (`1,544` rows) + `references_need_review.csv` (`29` rows) to match the Paper Catalog importer schema at the time, **only 4 columns were projected**:
     ```text
     product_name,gsm,width_mm,height_mm
     ```
   - All technical thickness columns (`MIKRONS`, `THICKNESS (mm)`), supplier codes (`CODE`), finish (`COAT`), category (`PAPER TYPE`), and provider (`PROVISER`) were stripped during CSV batch generation.
3. **Production Import Batch History (`paper_import_batches`)**:
   - Batch `imp_batch_f5a91b45b116495c` (`catalog_compatible_all.csv`, `1,544` rows) was confirmed in production on `2026-10-22` / `2026-10-23`:
     - `1,522` unique rows created `1,522` products in `paper_products` and `1,522` variants in `paper_variants`.
     - `22` rows were rejected (`16` duplicate `(product_name, gsm, width_mm, height_mm)` rows + `6` rows failing validation).
   - Batch `imp_batch_51d78087b2b24a53` (`demo_i3_sample.csv`, `2` rows) created `2` additional variants (`var_12e73b58b1b95990` `Galerie Art Silk 170g` and `var_bc3a9bd54f4c8b38` `Munken Pure 130g`) on existing products.
   - Total in production `paper_variants` = **`1,524` rows**.
4. **Why Migration `172` + `SPINE-06R` Only Activated 12 Variants**:
   - Migration `172_add_paper_caliper_and_reconciliation.sql` added `caliper_um`, `caliper_mm`, `bulk_factor`, `caliper_source`, `caliper_confidence_status`, and `caliper_revision` to `paper_variants`, defaulting existing rows to `NULL` / `NONE` / `MISSING`.
   - During `SPINE-06R`, `12` variants across 3 Livonia families (`G-Print 100 gsm`, `Amber Graphic 100 gsm`, `Galerie Art Matt 250 gsm`) were approved from `paper_technical_caliper_reference`, leaving `1,512` variants without caliper.

---

## 3. Extraction & Internal Consistency Audit of `Paper data base.ods.zip`

All `1,573` rows of `Paper data base.ods` were parsed directly from `content.xml` (handling `table:number-columns-repeated` and XML entities such as `&apos;` in row `1385` `POP'SET INDIGO 120 70x102`):

| Metric | Count | Details |
| --- | --- | --- |
| Total data rows in `Paper data base.ods` | `1,573` | XML rows `5`..`1577` |
| Rows with `MIKRONS > 0` and `THICKNESS (mm) > 0` | `1,201` | Range: `65 µm` (`0.065 mm`) to `655 µm` (`0.655 mm`) |
| Rows with `MIKRONS == 0`/empty and `THICKNESS (mm) == 0`/empty | `372` | Normalized to `MISSING` (never stored as `0 µm`) |
| Rows where only one of `MIKRONS` or `THICKNESS (mm)` is present | `0` | Both columns are always populated or empty together |
| Rows where `|THICKNESS (mm) × 1000 - MIKRONS| > 0.0001 µm` | `0` | **Zero internal unit discrepancies** (`maxDiffUm = 0.0000`) |

---

## 4. Production Reconciliation Summary (`1,524` Variants in `Control.paper_variants`)

Matching was executed deterministically on normalized `(product_name, gsm, width_mm, height_mm)` between `Control.paper_variants` (`JOIN paper_products`) and `Paper data base.ods.zip`:

| Classification | Variant Count | Sub-breakdown & Governance Decision |
| --- | ---: | --- |
| **`SAFE_UNIQUE_MATCH`** | **`1,162`** | **Eligible for automatic update** (1:1 bijective match between 1 production `variant_id` and 1 ODS row with valid `MIKRONS > 0`):<br>• `1,159` variants previously had `caliper_um = NULL` (`NONE` / `MISSING`) and receive their original supplier caliper.<br>• `3` variants (`G-Print 100 gsm`, `var_03f676cc35501e01`, `var_5b8cf1c9f6df87c3`, `var_90f4593482241ff9`) already had `98.00 µm` from Livonia (`SPINE-06R`), which matches ODS `98 µm` (`0.098 mm`) identically. |
| **`SOURCE_CALIPER_CONFLICT`** | **`9`** | **Excluded from overwrite (preserved existing caliper)**:<br>• `5` `Amber Graphic 100 gsm` variants (`var_2034f577e9744d69`, `var_385df13c21765f17`, `var_78a53d950e6e7203`, `var_b7e58d2185c544ed`, `var_f684162c6731f2f0`): existing Livonia caliper is `122.00 µm` vs ODS `119 µm`.<br>• `4` `Galerie Art Matt 250 gsm` variants (`var_0de271808ac08f23`, `var_1db15bdcb5d505c5`, `var_95b63b1457ba4708`, `var_d8d4a02568621c53`): existing Livonia caliper is `225.00 µm` vs ODS `257 µm`. |
| **`AMBIGUOUS_MATCH`** | **`16`** | **Excluded from automatic update** (1 production variant matches 2 duplicate rows in `Paper data base.ods` sharing identical `(NAME, GRAMS, WIDTH, Heights)`):<br>• `2` variants have conflicting positive calipers across duplicate ODS rows (`Maestro Print 170 64x90 FSC`: `198 µm` vs `204 µm`; `Munken Pure Rough 150 64x90`: `210 µm` vs `0`).<br>• `1` variant (`Efalin FINE LINEN 116 (Red) 120 70x100 FSC`) has `0` vs `165 µm`.<br>• `7` variants have identical positive calipers across duplicate ODS rows (`Cyclus Offset 90 64x90`, `G-Print 115 64x90`, `G-Print 115 70x100`, `Galerie Art Bulk 130 64x90`, `Galerie ArtMatt 115 64x90`, `Galerie ArtMatt 150 65x92`, `Munken Print White 15 115 64x90`), held back per strict 1:1 uniqueness rule.<br>• `6` variants have `0` microns in both duplicate ODS rows. |
| **`EXISTING_VERIFIED_CALIPER`** | **`0`** | No production variant had `caliper_confidence_status = 'VERIFIED'` prior to execution. |
| **`UNMATCHED`** | **`337`** | **Excluded from update (`caliper_um` remains `NULL`, status `MISSING`)**:<br>• `335` variants matched 1:1 to a unique ODS row whose `MIKRONS` and `THICKNESS (mm)` are `0`/empty in the supplier spreadsheet.<br>• `2` variants (`var_12e73b58b1b95990` `Galerie Art Silk 170g` and `var_bc3a9bd54f4c8b38` `Munken Pure 130g`) originated from `demo_i3_sample.csv` and do not exist in `Paper data base.ods`. |
| **TOTAL** | **`1,524`** | **100% of production `paper_variants` accounted for.** |
