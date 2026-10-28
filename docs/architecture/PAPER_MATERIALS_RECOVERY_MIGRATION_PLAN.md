# PAPER-MATERIALS-RECOVERY-03R — Production Backup, Selective 943-Row Migration Plan & Rollback Protocol

**Mission:** `PAPER-MATERIALS-RECOVERY-03R`  
**Phase:** Phase 2 (Verify Production State) & Phase 3 (Prepare Safe Selective Update)  
**Target Server:** `212.227.79.67` (MySQL `Control`)  
**Current Execution State:** **PREPARED & VERIFIED IN DRY-RUN (`PAPER_MATERIALS_RECOVERY_03R_READY_FOR_WRITE_APPROVAL`)** — Mass production write withheld per mission mandate until explicit write approval.

---

## 1. Direct Production Verification (Phase 2 — `PAPER-CALIPER-RECOVERY-02` Intact)

Direct SQL queries executed against `Control` on `212.227.79.67` at `2026-10-28T20:29:59Z` confirmed that all caliper recovery work from `PAPER-CALIPER-RECOVERY-02` is `100%` intact and no concurrent import is running:

| Metric Verified Directly on `212.227.79.67` (`Control`) | Expected | Verified Value | Status |
| :--- | :---: | :---: | :---: |
| Total `paper_variants` | `1,524` | **`1,524`** | **PASS** |
| Variants WITH approved caliper (`caliper_um > 0`) | `1,171` | **`1,171`** (`1,162` `SUPPLIER_IMPORT` + `9` `LIVONIA_REFERENCE_IMPORT`) | **PASS** |
| Variants WITHOUT caliper (`caliper_um IS NULL` / `MISSING`) | `353` | **`353`** | **PASS** |
| Source caliper discrepancies preserved (`[ODS Conflict:...]` in `paper_caliper_reconciliation_candidates`) | `9` | **`9`** (`5` `Amber Graphic 100g` `122 µm` vs `119 µm`; `4` `Galerie Art Matt 250g` `225 µm` vs `257 µm`) | **PASS** |
| Active write/import queries in `SHOW FULL PROCESSLIST` | `0` | **`0`** (`activeWriteQueries: []`) | **PASS** |
| `CHECKSUM TABLE Control.paper_products` | `2180808459` | **`2180808459`** (matches `paper_products_backup_rec03_20261028`) | **PASS** |
| `CHECKSUM TABLE Control.paper_variants` | `866434577` | **`866434577`** (matches `paper_variants_backup_rec03_20261028`) | **PASS** |
| `CHECKSUM TABLE Control.supplier_paper_offers` | `3737849396` | **`3737849396`** | **PASS** |

---

## 2. Mandatory Pre-Update Backups Executed on Production (`212.227.79.67`)

All backup artifacts are stored on `212.227.79.67` in `/opt/printprice-os/backups/paper-materials-recovery-03/` (directory permissions `0700`, file permissions `0600`, never tracked in Git):

| Artifact Path on `212.227.79.67` | Size (Bytes) | SHA-256 Checksum | Description |
| :--- | :---: | :--- | :--- |
| `/opt/printprice-os/backups/paper-materials-recovery-03/Control_full_backup_20261028_210500.sql` | `89,333,746` | `3d4fea67c0f1db861f1b8c4c6cee30db87f633a9cb0d992cbdbe95a475627555` | Full `mysqldump --single-transaction --routines --triggers Control` |
| `/opt/printprice-os/backups/paper-materials-recovery-03/Control_paper_tables_20261028_210500.sql` | `8,870,107` | `bd825d1d57d13f519e14f1be4ced0bee7fb24d5e0d710693219b39d587a95574` | Focused dump of `paper_products`, `paper_variants`, `supplier_paper_offers`, `paper_technical_caliper_reference`, `paper_caliper_reconciliation_candidates`, `paper_import_batches`, `paper_import_rows` |
| `/opt/printprice-os/backups/paper-materials-recovery-03/paper_technical_fields_snapshot_20261028_210500.json` | `2,821,450` | `fc8b91ad1f722c354a3ab174c44b38d39e8f9420fc89b7e966fa2257b180aad8` | JSON snapshot of all `1,522` products and `1,524` variants |
| `/opt/printprice-os/backups/paper-materials-recovery-03/rollback_paper_materials_recovery_03.sql` | `927` | `ead6729e3264ff5b1a3351a741afd4288ceee28dbb796ac94d604a84aec2bf3d` | Instant table-level rollback from in-DB backup tables |
| `/opt/printprice-os/backups/paper-materials-recovery-03/rollback_paper_materials_recovery_03r_943.sql` | `734,820` | `f3e798945a55d09ed06507f142eec69ebd82b9839d0241597f6a75859fbdf29a` | Row-by-row specific rollback for the `943` `SAFE_UNIQUE_MATCH` variants and `942` products |

---

## 3. Selective 943-Row Update Scope & Schema/Enum Compatibility (Phase 3)

Per `PAPER-MATERIALS-RECOVERY-03R` Phase 3, **only the `943` `SAFE_UNIQUE_MATCH` variants (`942` distinct `paper_products`) are eligible for write**. The remaining `581` variants (`501` `STRONG_MATCH_REVIEW`, `62` `ATTRIBUTE_CONFLICT`, `16` `AMBIGUOUS_MATCH`, `2` `ALREADY_VERIFIED`) are strictly **excluded** from automatic update and are never auto-converted into verified attributes at runtime.

### 3.1. Schema & Enum Compatibility Verification against `Control` MySQL DDL
We verified `INFORMATION_SCHEMA.COLUMNS` on `Control.paper_products` and `Control.paper_variants` against all `943` eligible rows in [`PAPER_MATERIALS_RECOVERY_03R_ELIGIBLE_943_DIFF.csv`](./PAPER_MATERIALS_RECOVERY_03R_ELIGIBLE_943_DIFF.csv):

| Target Table & Column | MySQL Production Column Type | Values in the `943` Eligible Rows | Compatibility |
| :--- | :--- | :--- | :---: |
| `paper_products.category` | `enum('CARTON','OFFSET','COATED','UNCOATED','DESIGN','DIGITAL','OTHER')` | `OFFSET` (`379`), `COATED` (`360`), `CARTON` (`108`), `DESIGN` (`96`) | **100% VALID ENUM** |
| `paper_products.finish_summary` | `varchar(128)` | `UNCOATED` (`466`), `SILK` (`251`), `MATT` (`130`), `OTHER` (`77`), `SEMI_GLOSS` (`11`), `GLOSS` (`8`) | **100% VALID VARCHAR** |
| `paper_products.metadata_json` | `json` | Adds `coating_status` (`COATED`: `450`, `UNCOATED`: `466`, `ONE_SIDE_COATED`: `27`), `coating_confidence: 'EXPLICIT_SOURCE'`, `ods_paper_type_raw`, `ods_coat_raw` | **100% VALID JSON** |
| `paper_variants.finish` | `varchar(64)` | `UNCOATED` (`466`), `SILK` (`251`), `MATT` (`130`), `OTHER` (`77`), `SEMI_GLOSS` (`11`), `GLOSS` (`8`) | **100% VALID VARCHAR** |
| `paper_variants.grain_direction` | `enum('LONG_GRAIN','SHORT_GRAIN','UNKNOWN')` | `UNKNOWN` (`943` — untouched, `0` grain inferences) | **100% UNTOUCHED** |
| `paper_variants.caliper_um` / `caliper_source` / `caliper_confidence_status` | `decimal(8,2)` / `enum` / `enum` | `811` with caliper + `132` without caliper — **strictly untouched by `UPDATE`** | **100% UNTOUCHED** |
| `paper_variants.metadata_json` | `json` | Preserves `ods_caliper_recovery` intact and appends `ods_materials_recovery` with full provenance | **100% VALID JSON** |

### 3.2. Before $\to$ After Transition Breakdown for the `943` `SAFE_UNIQUE_MATCH` Variants

| Before (`category / finish`) | After (`category / coating_status / finish`) | Variant Count |
| :--- | :--- | :---: |
| `OTHER / UNCOATED` | `OFFSET / UNCOATED / UNCOATED` | `340` |
| `COATED / SILK` | `COATED / COATED / SILK` | `193` |
| `OTHER / UNCOATED` | `DESIGN / UNCOATED / UNCOATED` | `79` |
| `COATED / SILK` | `COATED / COATED / MATT` | `65` |
| `OTHER / UNCOATED` | `COATED / COATED / SILK` | `57` |
| `OTHER / UNCOATED` | `COATED / COATED / MATT` | `45` |
| `OTHER / UNCOATED` | `CARTON / COATED / OTHER` | `41` |
| `OFFSET / UNCOATED` | `OFFSET / UNCOATED / UNCOATED` | `26` |
| `OTHER / UNCOATED` | `CARTON / ONE_SIDE_COATED / OTHER` | `23` |
| `COATED / SILK` | `CARTON / COATED / MATT` | `16` |
| `DESIGN / UNCOATED` | `OFFSET / UNCOATED / UNCOATED` | `13` |
| `DESIGN / UNCOATED` | `CARTON / COATED / OTHER` | `7` |
| `OTHER / UNCOATED` | `CARTON / COATED / SEMI_GLOSS` | `6` |
| `COATED / COATED` | `DESIGN / COATED / GLOSS` | `6` |
| `OTHER / UNCOATED` | `CARTON / UNCOATED / UNCOATED` | `5` |
| `OTHER / UNCOATED` | `DESIGN / COATED / SEMI_GLOSS` | `5` |
| `CARTON / UNCOATED` | `CARTON / ONE_SIDE_COATED / OTHER` | `4` |
| `OTHER / UNCOATED` | `CARTON / COATED / MATT` | `4` |
| `DESIGN / UNCOATED` | `DESIGN / UNCOATED / UNCOATED` | `3` |
| `OTHER / UNCOATED` | `DESIGN / COATED / GLOSS` | `2` |
| `CARTON / UNCOATED` | `CARTON / COATED / OTHER` | `1` |
| `COATED / SILK` | `CARTON / COATED / SILK` | `1` |
| `OTHER / UNCOATED` | `DESIGN / COATED / OTHER` | `1` |
| **TOTAL `SAFE_UNIQUE_MATCH`** | | **`943`** |

---

## 4. Execution & Rollback Commands

### 4.1. Controlled Production Write Command (Awaiting User Approval)
```bash
PAPER_MATERIALS_RECOVERY_03R_APPROVED=true node scripts/recover_paper_materials_from_ods.cjs --execute
```

### 4.2. Immediate Rollback Commands
- **Option 1 — Specific 943-row SQL rollback**:
  ```bash
  mysql Control < /opt/printprice-os/backups/paper-materials-recovery-03/rollback_paper_materials_recovery_03r_943.sql
  ```
- **Option 2 — Full table-level instant rollback from in-DB backup tables**:
  ```bash
  mysql Control < /opt/printprice-os/backups/paper-materials-recovery-03/rollback_paper_materials_recovery_03.sql
  ```


