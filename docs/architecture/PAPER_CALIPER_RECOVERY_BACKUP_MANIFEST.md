# PAPER-CALIPER-RECOVERY-02 — Backup & Rollback Manifest

- **Mission**: `PAPER-CALIPER-RECOVERY-02`
- **Server**: `212.227.79.67` (Plesk Production)
- **Database**: MySQL `Control` (`127.0.0.1:3306`)
- **Backup Directory**: `/opt/printprice-os/backups/paper-caliper-recovery-02` (Permissions: `0700` directory, `0600` files, strictly outside Git)
- **Timestamp (UTC)**: `2026-10-28T19:08:00Z` (`20261028_200800` local)

---

## 1. File-System Backup Artifacts on Production Server

All backup artifacts were generated and verified on `212.227.79.67` prior to executing any `UPDATE` on `Control`:

| Artifact Name | Absolute Path on Server | Size (Bytes) | SHA-256 Checksum | Description |
| --- | --- | ---: | --- | --- |
| `Control_full_backup_20261028_200800.sql` | `/opt/printprice-os/backups/paper-caliper-recovery-02/Control_full_backup_20261028_200800.sql` | `87,548,546` | `18b561a521fae28a6aa33a0ac2eb7e74a4fe021ca4d42321709e98bfea64e6ac` | Complete `mysqldump --single-transaction --routines --triggers` of the entire `Control` database |
| `Control_paper_tables_20261028_200800.sql` | `/opt/printprice-os/backups/paper-caliper-recovery-02/Control_paper_tables_20261028_200800.sql` | `1,409,665` | `b06872f4fc0525732c245d44b439897ec907dfc675acd062debc688a9f0e077b` | Targeted dump of `paper_products`, `paper_variants`, `paper_technical_caliper_reference`, `paper_caliper_reconciliation_candidates`, `supplier_paper_offers`, `paper_import_batches`, `paper_import_staging_rows`, `spine_calculation_snapshots`, `spine_material_governance_audit` |
| `paper_variants_snapshot_20261028_200800.json` | `/opt/printprice-os/backups/paper-caliper-recovery-02/paper_variants_snapshot_20261028_200800.json` | `1,151,700` | `c3c094245192cc45a75ad9932d91bc374c1b74134d168c2d7e404caf30b6c3a0` | Exact pre-recovery JSON snapshot of all `1,524` rows in `Control.paper_variants` |
| `paper_caliper_reconciliation_candidates_snapshot_20261028_200800.json` | `/opt/printprice-os/backups/paper-caliper-recovery-02/paper_caliper_reconciliation_candidates_snapshot_20261028_200800.json` | `1,072,523` | `390720174793281b1f0a8ce74cb61a442c3b91352dfa0f7f4b5b2e1c472b6b26` | Exact pre-recovery JSON snapshot of all `1,524` rows in `Control.paper_caliper_reconciliation_candidates` |
| `rollback_paper_caliper_recovery_02.sql` | `/opt/printprice-os/backups/paper-caliper-recovery-02/rollback_paper_caliper_recovery_02.sql` | `1,365` | `5f7000f5aa0128482e00bf8f2cb358cc2c6d286a014b5cd152165119ae089f7e` | Transactional SQL script to restore `paper_variants` and `paper_caliper_reconciliation_candidates` to their exact pre-mission state |

---

## 2. In-Database Clone Tables & Pre-Execution Checksums

In addition to disk dumps, two full clone tables were created inside MySQL `Control` prior to Phase 5:

| Table | Row Count | MySQL `CHECKSUM TABLE` | Purpose |
| --- | ---: | ---: | --- |
| `Control.paper_variants` (before) | `1,524` | `3709526411` | Production table before Phase 5 |
| `Control.paper_variants_backup_recovery02_20261028` | `1,524` | `3709526411` | Exact in-DB clone of `paper_variants` before Phase 5 |
| `Control.paper_caliper_reconciliation_candidates` (before) | `1,524` | `2414461624` | Production reconciliation table before Phase 6 |
| `Control.paper_caliper_reconciliation_candidates_bk_rec02_20261028` | `1,524` | `2414461624` | Exact in-DB clone of `paper_caliper_reconciliation_candidates` before Phase 6 |
| `Control.paper_products` | `1,522` | `2180808459` | Unchanged before and after (`2180808459`) |
| `Control.paper_technical_caliper_reference` | `375` | `2847849606` | Unchanged before and after (`2847849606`) |
| `Control.supplier_paper_offers` | `2` | `3737849396` | Unchanged before and after (`3737849396`) |

---

## 3. Rollback Procedure

If an immediate rollback to the pre-`PAPER-CALIPER-RECOVERY-02` state is ever required:

```sql
START TRANSACTION;

UPDATE paper_variants pv
INNER JOIN paper_variants_backup_recovery02_20261028 bk
  ON pv.variant_id = bk.variant_id
SET
  pv.caliper_um = bk.caliper_um,
  pv.caliper_mm = bk.caliper_mm,
  pv.bulk_factor = bk.bulk_factor,
  pv.caliper_source = bk.caliper_source,
  pv.caliper_confidence_status = bk.caliper_confidence_status,
  pv.caliper_revision = bk.caliper_revision,
  pv.metadata_json = bk.metadata_json,
  pv.updated_at = bk.updated_at;

UPDATE paper_caliper_reconciliation_candidates rc
INNER JOIN paper_caliper_reconciliation_candidates_bk_rec02_20261028 bk
  ON rc.candidate_id = bk.candidate_id
SET
  rc.current_caliper_um = bk.current_caliper_um,
  rc.proposed_caliper_um = bk.proposed_caliper_um,
  rc.proposed_caliper_mm = bk.proposed_caliper_mm,
  rc.proposed_bulk_factor = bk.proposed_bulk_factor,
  rc.reconciliation_status = bk.reconciliation_status,
  rc.review_decision = bk.review_decision,
  rc.reviewed_by = bk.reviewed_by,
  rc.reviewed_at = bk.reviewed_at,
  rc.review_notes = bk.review_notes,
  rc.updated_at = bk.updated_at;

COMMIT;
```
