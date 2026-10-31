# PAPER-CALIPER-RECOVERY-02 — Controlled Production Update Execution Log

- **Mission**: `PAPER-CALIPER-RECOVERY-02`
- **Script**: `scripts/recover_paper_calipers_from_ods.cjs`
- **Target Database**: MySQL `Control` (`212.227.79.67`)
- **Execution Window (UTC)**: `2026-10-28T19:10:23.869Z` — `2026-10-28T19:10:26.931Z`
- **Batch Size**: `100` rows per SQL transaction (`START TRANSACTION` ... `COMMIT`)

---

## 1. Update Scope & Enforced Safety Guards

For each of the **`1,162`** `SAFE_UNIQUE_MATCH` variants:

1. **Columns Updated on `Control.paper_variants`**:
   - `caliper_um = ROUND(ods_microns, 2)`
   - `caliper_mm = ROUND(ods_microns / 1000.0, 4)`
   - `bulk_factor = ROUND(ods_microns / gsm, 3)`
   - `caliper_source = 'SUPPLIER_IMPORT'`
   - `caliper_confidence_status = 'REFERENCE_IMPORTED'`
   - `caliper_revision = COALESCE(caliper_revision, 0) + 1`
   - `metadata_json = JSON_MERGE_PATCH(COALESCE(metadata_json, '{}'), ...)` with `ods_caliper_recovery` object recording:
     - `mission: "PAPER-CALIPER-RECOVERY-02"`
     - `source_file: "Paper data base.ods.zip"`
     - `source_sha256: "7ffb63eb2705fa0c6faa459001ddd3db0702aa25d0bca52fa58e1a13899d4c9a"`
     - `ods_source_row`, `ods_xml_row`, `ods_code`, `ods_provider`, `ods_coat`, `ods_paper_type`, `ods_microns_raw`, `ods_thickness_mm_raw`
     - `match_keys: "product_name+gsm+width_mm+height_mm"`
     - `recovered_at`
2. **Enforced SQL Guards**:
   - `WHERE variant_id = ? AND COALESCE(caliper_confidence_status, 'MISSING') != 'VERIFIED'`
   - In-memory pre-check inside each transaction verifying that `caliper_um` is either `NULL` or equal to the proposed `ods_microns` (`0` conflicts overwritten).
   - Zero `INSERT` or `DELETE` statements on `paper_products` or `paper_variants`.
   - Zero modifications to commercial columns (`product_id`, `sku`, `barcode`, `gsm`, `width_mm`, `height_mm`, `pack_sheets`, `grain_direction`, `status`).

---

## 2. Pass 1 — Initial Transactional Recovery (`PASS_1_INITIAL_RECOVERY`)

| Batch # | Variant Index Range | Rows in Batch | Variants Updated | Reconciliation Rows Updated | Skipped (Idempotent) | Transaction Status |
| :---: | :---: | ---: | ---: | ---: | ---: | :---: |
| `1` | `1 – 100` | `100` | `100` | `100` | `0` | `COMMITTED` |
| `2` | `101 – 200` | `100` | `100` | `100` | `0` | `COMMITTED` |
| `3` | `201 – 300` | `100` | `100` | `100` | `0` | `COMMITTED` |
| `4` | `301 – 400` | `100` | `100` | `100` | `0` | `COMMITTED` |
| `5` | `401 – 500` | `100` | `100` | `100` | `0` | `COMMITTED` |
| `6` | `501 – 600` | `100` | `100` | `100` | `0` | `COMMITTED` |
| `7` | `601 – 700` | `100` | `100` | `100` | `0` | `COMMITTED` |
| `8` | `701 – 800` | `100` | `100` | `100` | `0` | `COMMITTED` |
| `9` | `801 – 900` | `100` | `100` | `100` | `0` | `COMMITTED` |
| `10` | `901 – 1000` | `100` | `100` | `100` | `0` | `COMMITTED` |
| `11` | `1001 – 1100` | `100` | `100` | `100` | `0` | `COMMITTED` |
| `12` | `1101 – 1162` | `62` | `62` | `62` | `0` | `COMMITTED` |
| **TOTAL** | **`1 – 1162`** | **`1,162`** | **`1,162`** | **`1,162`** | **`0`** | **`12 / 12 COMMITTED`** |

---

## 3. Pass 2 — Idempotency Verification (`PASS_2_IDEMPOTENCY_VERIFICATION`)

Immediately after Pass 1 completed, the exact same recovery pipeline was executed a second time against `Control`:

| Batch # | Rows Checked | Variants Updated | Reconciliation Rows Updated | Skipped (Already Up-to-Date) | Transaction Status |
| :---: | ---: | ---: | ---: | ---: | :---: |
| `1` – `11` (each) | `100` | `0` | `0` | `100` | `COMMITTED (NO-OP)` |
| `12` | `62` | `0` | `0` | `62` | `COMMITTED (NO-OP)` |
| **TOTAL** | **`1,162`** | **`0`** | **`0`** | **`1,162`** | **`IDEMPOTENT PASS`** |

- Second execution modified **`0` rows** and did not increment `caliper_revision` a second time.
