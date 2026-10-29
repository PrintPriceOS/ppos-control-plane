# RECOVERY-10 — Phase 3 & Phase 4: Migration 174 Execution & Service Activation Report

**Mission:** `ORDEN DE MISIÓN — PAPER-MATERIALS-RECOVERY-10 — Despliegue productivo gobernado del sistema de evidencias técnicas`  
**Deployed Commit SHA:** `c99c5fbc6839e3817bddd6f9faf65ecf1a398d6a` (`git status --short` clean)  
**Migration Applied:** `174_phase197c_paper_evidence_and_technical_accreditation.sql`  
**Official Runner Used:** `node --env-file=.env scripts/run_control_plane_migrations.js`  
**Phase 3 & 4 Status:** **`PASS`**

---

## 1. Authorized Release Checkout & Environment Configuration

1. Checked out exact commit `c99c5fbc6839e3817bddd6f9faf65ecf1a398d6a` in `/opt/printprice-os/ppos-control-plane` (`checkedOutHead: "c99c5fbc6839e3817bddd6f9faf65ecf1a398d6a"`, `gitStatusClean: true`).
2. Configured private storage and feature flag in `/opt/printprice-os/ppos-control-plane/.env` (`0600` permissions, zero secret output):
   - `PAPER_EVIDENCE_STORAGE_DIR=/var/lib/ppos/private_evidence_store` (`hasPaperEvidenceStorageDir: true`)
   - `PAPER_SUPPLIER_HUB_ENABLED=true` (`hasPaperSupplierHubEnabled: true`)

---

## 2. Phase 183 Migration Integrity & Official Ledger Execution

### 2.1 Phase 183 Migration Integrity Validation (`node scripts/smoke_phase183_migration_integrity.js`)
- Exit Code: **`0`** (`Phase 183: PASSED`)
- `177` migrations classified, all baseline paths present, all `SHA-256` checksums matched.

### 2.2 Pre-Migration Dry-Run (`node --env-file=.env scripts/run_control_plane_migrations.js --dry-run`)
```text
Repository migrations   : 177
Legacy rows total       : 189
Migration rows resolved : 176
Baseline markers        : 1
Phase markers           : 12
Unresolved rows         : 0
Pending migrations      : 1
Failed migrations       : 0
Started migrations      : 0
Ledger status           : PENDING_MIGRATIONS
Diagnostic detail       : Pending required migration: migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql
```

### 2.3 Governed Execution (`node --env-file=.env scripts/run_control_plane_migrations.js`)
- Applied exclusively `migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql` (`Applied 1 new migrations`, exit code `0`).

### 2.4 Post-Migration Dry-Run & Ledger Verification (`schema_versions`)
```text
Repository migrations   : 177
Legacy rows total       : 190
Migration rows resolved : 177
Baseline markers        : 1
Phase markers           : 12
Unresolved rows         : 0
Pending migrations      : 0
Failed migrations       : 0
Started migrations      : 0
Ledger status           : READY
[DRY-RUN] All applied migrations match local baseline. DB is up to date.
```

Recorded row in `Control.schema_versions`:
- `version`: `174_phase197c_paper_evidence_and_technical_accreditation`
- `record_type`: `MIGRATION`
- `migration_path`: `migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql`
- `checksum`: `d1a400efe6962f0ff88beb7114ed1bb8603fff74ea7b4aa840c6ec64025e7144`
- `state`: **`APPLIED`** (`2026-10-29T12:15:54.000Z`)

---

## 3. Verification of Tables, `ON DELETE RESTRICT` Foreign Keys, Indexes & Idempotency

### 3.1 Created Tables (`information_schema.TABLES`)
1. `paper_variant_caliper_evidence` (`ENGINE=InnoDB`, `utf8mb4_unicode_ci`)
2. `paper_variant_caliper_audit_log` (`ENGINE=InnoDB`, `utf8mb4_unicode_ci`)
3. `paper_variant_classification_evidence` (`ENGINE=InnoDB`, `utf8mb4_unicode_ci`)

### 3.2 Foreign Keys (`information_schema.REFERENTIAL_CONSTRAINTS`)
All **6** foreign keys across the 3 new tables enforce **`DELETE_RULE = 'RESTRICT'`**:

| `CONSTRAINT_NAME` | `TABLE_NAME` | `REFERENCED_TABLE_NAME` | `DELETE_RULE` | `UPDATE_RULE` |
|---|---|---|---|---|
| `fk_pvcal_evidence` | `paper_variant_caliper_audit_log` | `paper_variant_caliper_evidence` | **`RESTRICT`** | `NO ACTION` |
| `fk_pvcal_variant` | `paper_variant_caliper_audit_log` | `paper_variants` | **`RESTRICT`** | `NO ACTION` |
| `fk_pvce_product` | `paper_variant_caliper_evidence` | `paper_products` | **`RESTRICT`** | `NO ACTION` |
| `fk_pvce_variant` | `paper_variant_caliper_evidence` | `paper_variants` | **`RESTRICT`** | `NO ACTION` |
| `fk_pvcle_product` | `paper_variant_classification_evidence` | `paper_products` | **`RESTRICT`** | `NO ACTION` |
| `fk_pvcle_variant` | `paper_variant_classification_evidence` | `paper_variants` | **`RESTRICT`** | `NO ACTION` |

### 3.3 Indexes & Idempotency
- All `17` index entries (`PRIMARY`, `uk_pvce_tenant_idempotency`, `idx_pvce_tenant_variant`, `idx_pvce_variant_status`, `idx_pvce_supplier_status`, `idx_pvce_track_status`, `idx_pvce_sha256`, `idx_pvcal_variant_time`, `idx_pvcal_evidence`, `idx_pvcal_tenant_time`, `uk_pvcle_tenant_idempotency`, `idx_pvcle_variant_status`, `idx_pvcle_tenant_variant`, etc.) were verified in `information_schema.STATISTICS`.
- Re-executing the DDL statements directly against `MySQL Control` succeeded with **`0` errors** (`IDEMPOTENT_ZERO_ERRORS`).

### 3.4 Post-Migration Catalog & Checksum Invariance
- `total_variants = 1524`, `with_caliper = 1272`, `missing_caliper = 252`, `historical_9_with_caliper = 9`, `historical_9_in_missing_252 = 0`.
- Table checksums after Migration `174` are **100% identical** to pre-migration checksums:
  - `Control.paper_products`: **`1734492320`**
  - `Control.paper_variants`: **`2093607442`**
  - `Control.supplier_paper_offers`: **`3737849396`**
  - `Control.paper_technical_caliper_reference`: **`2847849606`**
  - `Control.paper_caliper_reconciliation_candidates`: **`3402454981`**

---

## 4. Phase 4: Frontend Build, Web Root Sync & Controlled PM2 Reload

1. Built the production frontend bundle (`npm run build` in `/opt/printprice-os/ppos-control-plane` -> `dist/assets/index-Do05IBmJ.js`, `dist/assets/index-Op6wpzR4.css`, exit code `0`) and synced `dist/*` to `/var/www/vhosts/printprice.pro/control.printprice.pro/httpdocs/` (after archiving the previous `httpdocs` in `httpdocs_pre_recovery10.tar.gz`).
2. Reloaded **only** `ppos-control-plane` (`pm2 reload ppos-control-plane --update-env && pm2 save`, exit code `0`) without changing the effective PM2 user (`root`).
3. Verified post-reload service health:
   - `GET http://127.0.0.1:8081/live` -> `{"status":"UP"}`
   - `GET http://127.0.0.1:8081/ready` -> `{"status":"READY","service":"ppos-control-plane","schema":{"status":"READY","manifestVersion":1}}`
   - All other PM2 processes (`preflight-app`, `printprice-web`, `budget-app`) remained untouched and online.
