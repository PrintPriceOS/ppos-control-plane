# PAPER-CALIPER-RECOVERY-02 — Before vs. After Production Audit

- **Mission**: `PAPER-CALIPER-RECOVERY-02`
- **Database**: MySQL `Control` (`212.227.79.67`)
- **Date**: `2026-10-28`

---

## 1. `Control.paper_variants` — Caliper Coverage Before vs. After

| `caliper_source` | `caliper_confidence_status` | Before Count | Before % | After Count | After % | Delta |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `SUPPLIER_IMPORT` | `REFERENCE_IMPORTED` | `0` | `0.00%` | **`1,162`** | **`76.25%`** | **`+1,162`** |
| `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `12` | `0.79%` | **`9`** | **`0.59%`** | `-3` (3 `G-Print 100g` matched ODS `98 µm` identically) |
| `MANUFACTURER_DATASHEET` / `MICROMETER_MEASURED` | `VERIFIED` | `0` | `0.00%` | **`0`** | **`0.00%`** | `0` (no unverified import marked `VERIFIED`) |
| **Subtotal WITH Valid Caliper (`caliper_um > 0`)** | **`REFERENCE_IMPORTED`** | **`12`** | **`0.79%`** | **`1,171`** | **`76.84%`** | **`+1,159` newly enabled variants** |
| `NONE` | `MISSING` (`caliper_um IS NULL`) | `1,512` | `99.21%` | **`353`** | **`23.16%`** | **`-1,159`** |
| **TOTAL `paper_variants`** | **All Statuses** | **`1,524`** | **`100.00%`** | **`1,524`** | **`100.00%`** | **`0` (Zero duplicates / zero new variants)** |

---

## 2. Breakdown of the 353 Variants Remaining `MISSING` (`caliper_um IS NULL`)

| Reason for Remaining `MISSING` | Count | Governance Rule Applied |
| --- | ---: | --- |
| Unique 1:1 match in `Paper data base.ods`, but supplier `MIKRONS = 0` and `THICKNESS (mm) = 0` | `335` | `0` or empty thickness in ODS is normalized to `MISSING` (`NULL`); never invented or defaulted |
| Ambiguous duplicate rows in `Paper data base.ods` (`2` ODS rows sharing identical `NAME + GRAMS + WIDTH + Heights`) | `16` | Excluded per Phase 3/5 rule (`AMBIGUOUS_MATCH` requires manual review) |
| Demo variants from `demo_i3_sample.csv` (`var_12e73b58b1b95990`, `var_bc3a9bd54f4c8b38`) not present in ODS | `2` | `UNMATCHED` in ODS; kept `MISSING` |
| **Total Remaining `MISSING`** | **`353`** | Blocked from Spine geometry calculation with explicit `CALIPER_VERIFICATION_REQUIRED` |

---

## 3. `Control.paper_caliper_reconciliation_candidates` — Before vs. After (Phase 6)

| `reconciliation_status` | `review_decision` | Before Count | After Count | Explanation |
| --- | --- | ---: | ---: | --- |
| `SAFE_EXACT_MATCH` | `APPROVED` | `12` | `12` | 12 variants approved during `SPINE-06R` |
| `SAFE_EXACT_MATCH` | `PENDING_REVIEW` | `305` | `149` | 149 variants where Livonia reference caliper matches the newly recovered ODS caliper (or where ODS had `0` microns) |
| `CONFLICT_EXISTING_CALIPER` | `PENDING_REVIEW` | `0` | `156` | 156 variants where the newly recovered supplier ODS `caliper_um` differs from the Livonia reference library (`paper_technical_caliper_reference`); flagged as `CONFLICT_EXISTING_CALIPER` so Livonia reference never silently overwrites supplier caliper |
| `AMBIGUOUS_MULTIPLE_BULK` | `PENDING_REVIEW` | `59` | `59` | Multi-bulk families (e.g. Holmen Book / Munken Print with multiple bulk factors per gsm) |
| `UNMATCHED_IN_REFERENCE` | `PENDING_REVIEW` | `1,148` | `1,148` | Variants not in Livonia's 375-row reference table (895 of which now have `current_caliper_um` populated from `Paper data base.ods`) |
| **TOTAL** | | **`1,524`** | **`1,524`** | **All `1,524` candidate records synchronized with `current_caliper_um`** |

---

## 4. Commercial Catalog & Price Integrity Verification

A row-by-row SQL join comparing `Control.paper_variants` against `Control.paper_variants_backup_recovery02_20261028` and `CHECKSUM TABLE` across all Paper Materials tables confirmed zero commercial drift:

| Verification Check | Before | After | Result |
| --- | --- | --- | --- |
| `COUNT(*)` in `Control.paper_products` | `1,522` | `1,522` | **IDENTICAL (`0` new products)** |
| `CHECKSUM TABLE Control.paper_products` | `2180808459` | `2180808459` | **100% IDENTICAL** |
| `COUNT(*)` in `Control.paper_variants` | `1,524` | `1,524` | **IDENTICAL (`0` duplicate variants)** |
| Commercial columns diff on `paper_variants` (`product_id`, `sku`, `barcode`, `gsm`, `width_mm`, `height_mm`, `pack_sheets`, `grain_direction`, `status`) | `0` diffs | `0` diffs | **`commercialColumnsDiffCount = 0`** |
| `CHECKSUM TABLE Control.supplier_paper_offers` | `3737849396` | `3737849396` | **100% IDENTICAL (Zero price modifications)** |
| `CHECKSUM TABLE Control.paper_technical_caliper_reference` | `2847849606` | `2847849606` | **100% IDENTICAL** |
