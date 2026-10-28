# PAPER-MATERIALS-RECOVERY-03 — Production Backup, Migration Plan & Rollback Protocol

**Mission:** `PAPER-MATERIALS-RECOVERY-03`  
**Phase:** Phase 5 (Mandatory Backup) & Phase 6 (Controlled Update Strategy)  
**Target Server:** `212.227.79.67` (MySQL `Control`)  
**Current Execution State:** **PREPARED & VERIFIED IN DRY-RUN (`PAPER_MATERIALS_RECOVERY_03_READY_FOR_APPROVAL`)** — Mass production write withheld per Phase 6 mandate until user approval.

---

## 1. Mandatory Pre-Update Backups Executed on Production (`212.227.79.67`)

Before preparing any database update script, a full pre-update backup and table snapshot were executed on `212.227.79.67` in `/opt/printprice-os/backups/paper-materials-recovery-03/` (directory permissions `0700`, file permissions `0600`, never tracked in Git):

| Artifact Path on `212.227.79.67` | Size (Bytes) | SHA-256 Checksum | Description |
| :--- | :---: | :--- | :--- |
| `/opt/printprice-os/backups/paper-materials-recovery-03/Control_full_backup_20261028_210500.sql` | `89,333,746` | `3d4fea67c0f1db861f1b8c4c6cee30db87f633a9cb0d992cbdbe95a475627555` | Full `mysqldump --single-transaction --routines --triggers --events Control` |
| `/opt/printprice-os/backups/paper-materials-recovery-03/Control_paper_tables_20261028_210500.sql` | `8,870,107` | `bd825d1d57d13f519e14f1be4ced0bee7fb24d5e0d710693219b39d587a95574` | Focused dump of `paper_products`, `paper_variants`, `supplier_paper_offers`, `paper_technical_caliper_reference`, `paper_import_batches`, `paper_import_staging_rows` |
| `/opt/printprice-os/backups/paper-materials-recovery-03/paper_technical_fields_snapshot_20261028_210500.json` | `2,821,450` | `fc8b91ad1f722c354a3ab174c44b38d39e8f9420fc89b7e966fa2257b180aad8` | JSON snapshot of all `1,524` variants (`variant_id`, `product_id`, `product_name`, `paper_type`, `coating_status`, `gsm`, `width_mm`, `height_mm`, `grain_direction`, `finish`, `caliper_um`, `caliper_source`, `caliper_confidence`, `metadata_json`) |
| `/opt/printprice-os/backups/paper-materials-recovery-03/rollback_paper_materials_recovery_03.sql` | `927` | `ead6729e3264ff5b1a3351a741afd4288ceee28dbb796ac94d604a84aec2bf3d` | Transactional SQL rollback restoring from in-DB backup tables |

### In-Database Clone Tables & Pre-Update Checksums
In addition to the `.sql` and `.json` files on disk, two exact clone tables were created inside `Control`:
- `Control.paper_products_backup_rec03_20261028` (`1,165` rows, `CHECKSUM TABLE = 2180808459`)
- `Control.paper_variants_backup_rec03_20261028` (`1,524` rows, `CHECKSUM TABLE = 866434577`)
- `Control.supplier_paper_offers` (`3,044` rows, `CHECKSUM TABLE = 3737849396`)

---

## 2. Deterministic Reconciliation & Update Tiers (`1,524` Variants)

The deterministic CLI [`scripts/recover_paper_materials_from_ods.cjs`](../../scripts/recover_paper_materials_from_ods.cjs) reconciles all `1,524` production variants against `Paper data base.ods.zip` (`1,573` rows) and classifies every variant into six strict tiers documented row-by-row in [`PAPER_MATERIALS_RECOVERY_MATCH_MATRIX.csv`](./PAPER_MATERIALS_RECOVERY_MATCH_MATRIX.csv):

| Category | Variants | % of Catalog | Proposed Action Upon Approval |
| :--- | :---: | :---: | :--- |
| **`SAFE_UNIQUE_MATCH`** | **`943`** | `61.88%` | **Tier 1 (Default `--apply`)**: Unique 1:1 tuple match `(product_name, gsm, width_mm, height_mm)` with explicit, non-conflicting `PAPER TYPE` and `COAT` in ODS (`krītots`, `nekrītots`, `1xkrītots`, `2xkrītots`). Updates `paper_variants.finish`, `paper_variants.metadata_json.ods_materials_recovery` (`originalCode`, `sortiment`, `proviserRaw`, `supplierCodeNormalized`, `coatingStatus`, `coatingConfidence`), and `paper_products.paper_type` + `paper_products.coating_status` (when all variants of the product agree). |
| **`STRONG_MATCH_REVIEW`** | **`501`** | `32.87%` | **Tier 2 (Optional `--include-strong-review`)**: Unique 1:1 tuple match where either:<br>• `COAT` is empty/brand-tagged and resolved by verified mill-family rules (`307` variants: `Ofset` $\to$ `UNCOATED` [`70`], `Dizaina` uncoated mill lines $\to$ `UNCOATED` [`138`], `Matt` coated mill lines $\to$ `COATED/MATT` [`63`], `Silk` $\to$ `COATED/SILK` [`39`], `Silk` with `Gloss`/`Matt` in name [`8`], `Kappa` $\to$ `CARTON/UNCOATED` [`10`], `Kartons` `1S`/`GC1`/`GC2` [`7`], `semigloss` [`1`]);<br>• `PAPER TYPE = Silk` with `krītots` while product name specifies `Gloss` (`102` variants $\to$ `COATED/GLOSS`);<br>• `COAT` is empty on specialty `Dizaina`/`Kartons`/`Group 1` (`84` variants $\to$ clears false `UNCOATED` to `UNKNOWN` and sets `paper_type` to `DESIGN`/`CARTON`/`OTHER`). |
| **`ATTRIBUTE_CONFLICT`** | **`62`** | `4.07%` | **Blocked from automatic coating/finish overwrite**: Unique 1:1 tuple match with conflicting source tokens (`COAT = Jautāt` [`31`], `COAT = dizaina` on covering materials [`21`], `PAPER TYPE = Matt` vs `COAT = nekrītots` [`2`], `PAPER TYPE = Matt` vs `COAT = silk` [`2`], `kritots/nekritot` [`1`], `POLAP` [`1`], `70` [`1`], `mitrumizturīgs` [`1`], `caurspīdīgs` [`1`], `Sintētiskais` [`1`], `Geltex LS` in `Ofset` [`1`]). Preserved for manual review or cleared to `UNKNOWN` so false `UNCOATED` / false `COATED` values are not shown. |
| **`AMBIGUOUS_MATCH`** | **`16`** | `1.05%` | **Blocked from automatic overwrite**: Duplicate tuples (`2` rows each in ODS = `32` rows across `Efalin FINE LINEN`, `Maestro Print 170`, `Maxi Satin 115`, `Munken Polar 300`, `Munken Print Cream 15`, `Munken Print White 15`, `Munken Pure Rough`). Note: for `15` of these `16` variants, both duplicate ODS rows have identical `PAPER TYPE` and `COAT`; only `Munken Pure Rough 100 90x64` differs (`COAT = nekrītots` vs empty). |
| **`ALREADY_VERIFIED`** | **`2`** | `0.13%` | **Untouched**: Accredited demo rows (`var_9cd7c29f956dc9e0` `LONG_GRAIN`, `var_035cb8ab7cd3fa7e` `SHORT_GRAIN`). |
| **`UNMATCHED`** | **`0`** | `0.00%` | None (`100%` of non-demo variants matched). |

---

## 3. Commercial & Spine Calculator Safety Guarantees

1. **Zero Commercial Mutation**:
   - `scripts/recover_paper_materials_from_ods.cjs` never executes `INSERT` or `DELETE` on `paper_products`, `paper_variants`, or `supplier_paper_offers`.
   - `price_per_ton`, `sheet_price`, `currency`, `availability_status`, `tenant_id`, `gsm`, `width_mm`, and `height_mm` are strictly untouched.
2. **Zero Caliper Regression**:
   - All `1,508` variants with `caliper_um` recovered in `PAPER-CALIPER-RECOVERY-02` already match the exact thickness in `Paper data base.ods.zip` (`0` caliper discrepancies). `recover_paper_materials_from_ods.cjs` does not overwrite approved `caliper_um` values.
3. **Product-Level Consistency Guard (`paper_products`)**:
   - Because `paper_type` and `coating_status` are stored on `paper_products` (`1,165` products for `1,524` variants), `recover_paper_materials_from_ods.cjs` only updates `paper_products.paper_type` and `paper_products.coating_status` when all reconciled variants belonging to that `product_id` agree on the same `paperType` and `coatingStatus`. Every individual variant always receives its exact per-variant attributes in `paper_variants.finish` and `paper_variants.metadata_json.ods_materials_recovery`.

---

## 4. Execution & Rollback Commands

### 4.1. Dry-Run Command (Already Executed & Verified)
```bash
node scripts/recover_paper_materials_from_ods.cjs --dry-run
```

### 4.2. Controlled Production Apply Command (Awaiting User Approval)
- **Option A — Apply only Tier 1 (`SAFE_UNIQUE_MATCH`: `943` variants)**:
  ```bash
  node scripts/recover_paper_materials_from_ods.cjs --apply
  ```
- **Option B — Apply Tier 1 + Tier 2 (`SAFE_UNIQUE_MATCH` + `STRONG_MATCH_REVIEW`: `943 + 501 = 1,444` variants)**:
  ```bash
  node scripts/recover_paper_materials_from_ods.cjs --apply --include-strong-review
  ```

### 4.3. Immediate 1-Step Rollback Command
If any anomaly is detected after applying the update, the database can be restored to the exact pre-recovery state in `< 1 second` using the in-database backup tables:

```sql
START TRANSACTION;

UPDATE paper_products p
JOIN paper_products_backup_rec03_20261028 b ON p.product_id = b.product_id
SET
  p.paper_type = b.paper_type,
  p.coating_status = b.coating_status,
  p.updated_at = b.updated_at;

UPDATE paper_variants v
JOIN paper_variants_backup_rec03_20261028 b ON v.variant_id = b.variant_id
SET
  v.finish = b.finish,
  v.grain_direction = b.grain_direction,
  v.caliper_um = b.caliper_um,
  v.caliper_source = b.caliper_source,
  v.caliper_confidence = b.caliper_confidence,
  v.caliper_updated_at = b.caliper_updated_at,
  v.caliper_verified_by = b.caliper_verified_by,
  v.metadata_json = b.metadata_json,
  v.updated_at = b.updated_at;

COMMIT;
```
