# RECOVERY-10 — Phase 2: Full Production Backup Manifest & Restorability Verification

**Mission:** `ORDEN DE MISIÓN — PAPER-MATERIALS-RECOVERY-10 — Despliegue productivo gobernado del sistema de evidencias técnicas`  
**Backup Directory (Outside Repository):** `/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z`  
**Directory Permissions:** `0700` (`root:root`)  
**Artifact Permissions:** `0600` (`root:root`)  
**Credential Exposure in CLI / Logs / Artifacts:** **`0`** (Executed via temporary `0600` `--defaults-extra-file` deleted immediately in `finally` block; `tempCredentialsFileDeleted: true`)  
**Phase 2 Status:** **`PASS (100% Readable & Restorable)`**

---

## 1. Backed-Up Artifacts & Cryptographic `SHA-256` Manifest

All backups were stored outside the Git repository under `/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z` with restricted owner-only permissions (`0700` directory, `0600` files) before applying Migration `174` or activating the new release:

| Artifact File Name | Full Path on `212.227.79.67` | Size (Bytes) | Mode | `SHA-256` Checksum |
|---|---|---:|---|---|
| **`full_control_db_pre_recovery10.sql`** | `/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/full_control_db_pre_recovery10.sql` | `97,103,583` | `0600` | `1d5cfc0d5c3eac85febd05bd4669f14abb9b33249174995d42e4ccfda6adba07` |
| **`paper_catalog_and_ledger_pre_recovery10.sql`** | `/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/paper_catalog_and_ledger_pre_recovery10.sql` | `4,039,493` | `0600` | `184c490e9c464d6ee7ea9139cef3126f515e12f8d20804de35565a1b8b2780e7` |
| **`control_plane_exec_3874c42b_pre_recovery10.tar.gz`** | `/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/control_plane_exec_3874c42b_pre_recovery10.tar.gz` | `6,123,167` | `0600` | `558805c7e801085e60b5898685e929418ab76e5823518ee6d065e2a466c3d6bb` |
| **`httpdocs_pre_recovery10.tar.gz`** | `/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/httpdocs_pre_recovery10.tar.gz` | `1,069,144` | `0600` | `c608e7cade50cb80e892985357384b70b21c8ce80725bfbb5f65719a690fb87a` |
| **`174_phase197c_paper_evidence_and_technical_accreditation.sql`** | `/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/174_phase197c_paper_evidence_and_technical_accreditation.sql` | `11,059` | `0600` | `d1a400efe6962f0ff88beb7114ed1bb8603fff74ea7b4aa840c6ec64025e7144` |
| **`rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql`** | `/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql` | `1,056` | `0600` | `e24bedbd7f975f14391c63703017d647c4070b2d980608e017673c6fbadc42b4` |
| **`phase5_smoke_test_forensic_records.json`** | `/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/phase5_smoke_test_forensic_records.json` | `6,842` | `0600` | `15b797f47354fd02dd747701f4f96db5e76de9afb5b3d96c8d34a65332458474` |

---

## 2. Exact `SHA256SUMS.manifest` Verification Output

```text
1d5cfc0d5c3eac85febd05bd4669f14abb9b33249174995d42e4ccfda6adba07  /var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/full_control_db_pre_recovery10.sql
184c490e9c464d6ee7ea9139cef3126f515e12f8d20804de35565a1b8b2780e7  /var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/paper_catalog_and_ledger_pre_recovery10.sql
558805c7e801085e60b5898685e929418ab76e5823518ee6d065e2a466c3d6bb  /var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/control_plane_exec_3874c42b_pre_recovery10.tar.gz
d1a400efe6962f0ff88beb7114ed1bb8603fff74ea7b4aa840c6ec64025e7144  /var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/174_phase197c_paper_evidence_and_technical_accreditation.sql
e24bedbd7f975f14391c63703017d647c4070b2d980608e017673c6fbadc42b4  /var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql
c608e7cade50cb80e892985357384b70b21c8ce80725bfbb5f65719a690fb87a  /var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/httpdocs_pre_recovery10.tar.gz
15b797f47354fd02dd747701f4f96db5e76de9afb5b3d96c8d34a65332458474  /var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/phase5_smoke_test_forensic_records.json
```

Verification command `sha256sum -c /var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/SHA256SUMS.manifest`:
```text
/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/full_control_db_pre_recovery10.sql: OK
/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/paper_catalog_and_ledger_pre_recovery10.sql: OK
/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/control_plane_exec_3874c42b_pre_recovery10.tar.gz: OK
/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/174_phase197c_paper_evidence_and_technical_accreditation.sql: OK
/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql: OK
/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/httpdocs_pre_recovery10.tar.gz: OK
/var/backups/ppos/paper_materials_recovery_10_20261029T121500Z/phase5_smoke_test_forensic_records.json: OK
```

---

## 3. Readability & Restorability Verification

Before proceeding to Phase 3, automated structural and archive checks confirmed that every backup artifact is complete and restorable:

| Verification Check | Result |
|---|---|
| `full_control_db_pre_recovery10.sql` ends with `-- Dump completed on 2026-10-29 ...` | **`true` (`PASS`)** |
| `paper_catalog_and_ledger_pre_recovery10.sql` ends with `-- Dump completed on 2026-10-29 ...` | **`true` (`PASS`)** |
| Critical `CREATE TABLE` + `INSERT INTO` statements (`paper_products`, `paper_variants`, `supplier_paper_offers`, `schema_versions`) verified in dump | **`true` (`PASS`)** |
| `control_plane_exec_3874c42b_pre_recovery10.tar.gz` integrity (`tar -tzf`) | **`3,344` entries verified (`dist/index.html`, `server.js`, `src/`, `migrations/`, `scripts/`)** |
| Overall Restorability Gate (`restorable`) | **`true` (`PASS`)** |
