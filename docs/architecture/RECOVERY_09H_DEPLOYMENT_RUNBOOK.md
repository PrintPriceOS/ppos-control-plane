# RECOVERY-09H — Production Deployment Runbook & Readiness Procedure

**Mission:** `PAPER-MATERIALS-RECOVERY-09H — Auditoría final de integridad, seguridad y preparación de despliegue`  
**Repository:** `PrintPriceOS/ppos-control-plane`  
**Target Environment:** `MySQL Control` (Production for Testers) + `Control Plane` (`control.printprice.pro`)  
**Migration File:** [`migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql)  
**Rollback File:** [`migrations/rollback/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/rollback/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql)  
**Execution Status in `RECOVERY-09H`:** **`NOT_EXECUTED_IN_PRODUCTION (Prepared & Certified for Deployment Approval)`**

---

## 0. Governed Invariants & Safety Gates

Before, during, and after executing this runbook in production, the following invariants are **strictly enforced**:
1. **Zero Caliper Mutation by Migration 174:** Migration `174` is 100% additive (`CREATE TABLE IF NOT EXISTS` for 3 tables) and issues **zero `UPDATE` or `ALTER` statements** on `paper_variants` or `paper_products`.
2. **Catalog Baseline Preservation:**
   - Total `paper_variants`: **`1,524`**
   - Variants with caliper (`caliper_um IS NOT NULL`): **`1,272`** (`83.46%`)
   - Variants without caliper (`caliper_um IS NULL`): **`252`** (`16.54%`)
   - Historical conflicts preserved (`caliper_um IS NULL`): **`9`** (`var_2b0314c68f5a97c7`, `var_7b7e3a2a2a4a0313`, `var_4178aecbfa53dcf8`, `var_c699e6a51cd6b41f`, `var_5f5cae75e6f45671`, `var_ae7dbf443ceab19a`, `var_9dabfd7ac5eff6ca`, `var_06e1d1681e4f0989`, `var_e2f2e68304e9d4a1`)
   - Effective pending technical classifications (`G1..G6`): **`337`**
3. **Referential Integrity (`ON DELETE RESTRICT`):** All 6 foreign keys across `paper_variant_caliper_evidence`, `paper_variant_caliper_audit_log`, and `paper_variant_classification_evidence` enforce `ON DELETE RESTRICT`.
4. **Industrial Release Lock:** `canReleaseToManufacturing` remains **`false`**; approval of evidence never mutates `paper_variants.caliper_um` (`productiveCaliperModified: false`).

---

## Phase 1 — Read-Only Production Schema & Catalog Preflight

Run the following read-only verification against `MySQL Control` before any backup or migration:

```sql
-- 1.1 Verify catalog counts & 9 historical conflicts
SELECT
    COUNT(*) AS total_variants,
    SUM(CASE WHEN caliper_um IS NOT NULL THEN 1 ELSE 0 END) AS with_caliper,
    SUM(CASE WHEN caliper_um IS NULL THEN 1 ELSE 0 END) AS missing_caliper,
    SUM(CASE WHEN id IN (
        'var_2b0314c68f5a97c7','var_7b7e3a2a2a4a0313','var_4178aecbfa53dcf8',
        'var_c699e6a51cd6b41f','var_5f5cae75e6f45671','var_ae7dbf443ceab19a',
        'var_9dabfd7ac5eff6ca','var_06e1d1681e4f0989','var_e2f2e68304e9d4a1'
    ) AND caliper_um IS NULL THEN 1 ELSE 0 END) AS protected_conflicts_null
FROM paper_variants;
-- Expected: total_variants = 1524, with_caliper = 1272, missing_caliper = 252, protected_conflicts_null = 9

-- 1.2 Verify whether Migration 174 tables exist yet
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
      'paper_variant_caliper_evidence',
      'paper_variant_caliper_audit_log',
      'paper_variant_classification_evidence'
  );
-- Expected prior to deployment: 0 rows
```

Also verify local/server Phase 183 migration integrity baseline before deployment:

```bash
node scripts/smoke_phase183_migration_integrity.js
# Expected: Phase 183: PASSED (177 baselined migrations, 0 drift errors)
```

---

## Phase 2 — Pre-Migration Backup & Cryptographic `SHA-256` Manifest

Create a timestamped backup directory **outside** the Git repository (e.g., `/var/backups/ppos/recovery_09h_$(date -u +%Y%m%dT%H%M%SZ)` with `0700` permissions) and export the current catalog and schema state:

```bash
BACKUP_DIR="/var/backups/ppos/recovery_09h_$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

mysqldump --single-transaction --routines --triggers \
  -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" \
  "$DB_NAME" paper_products paper_variants supplier_paper_catalog_variants supplier_paper_offers schema_versions \
  > "$BACKUP_DIR/pre_migration_174_catalog_backup.sql"

sha256sum "$BACKUP_DIR/pre_migration_174_catalog_backup.sql" \
  migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql \
  migrations/rollback/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql \
  > "$BACKUP_DIR/SHA256SUMS.manifest"

chmod 600 "$BACKUP_DIR"/*
cat "$BACKUP_DIR/SHA256SUMS.manifest"
```

---

## Phase 3 — Private PDF Evidence Store Provisioning

Provision the private, non-public directory for durable PDF datasheet storage outside the web root:

```bash
export PAPER_EVIDENCE_STORAGE_DIR="/var/lib/ppos/private_evidence_store"
mkdir -p "$PAPER_EVIDENCE_STORAGE_DIR"
chown ppos:ppos "$PAPER_EVIDENCE_STORAGE_DIR"
chmod 700 "$PAPER_EVIDENCE_STORAGE_DIR"
```

Ensure `PAPER_EVIDENCE_STORAGE_DIR=/var/lib/ppos/private_evidence_store` and `PAPER_SUPPLIER_HUB_ENABLED=true` are present in the service environment configuration.

---

## Phase 4 — Controlled Execution of Migration 174

1. **Dry-Run Verification:**
   ```bash
   node scripts/smoke_phase183_migration_integrity.js
   ```
2. **Apply Migration `174`:**
   ```bash
   mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
     < migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql
   ```

---

## Phase 5 — Post-Migration Schema & Referential Integrity Validation

Immediately verify that all 3 tables exist, all 6 foreign keys enforce `DELETE_RULE = 'RESTRICT'`, and the `1,524` catalog rows remain untouched:

```sql
-- 5.1 Verify all 6 foreign keys enforce ON DELETE RESTRICT
SELECT
    CONSTRAINT_NAME,
    TABLE_NAME,
    REFERENCED_TABLE_NAME,
    UPDATE_RULE,
    DELETE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
      'paper_variant_caliper_evidence',
      'paper_variant_caliper_audit_log',
      'paper_variant_classification_evidence'
  )
ORDER BY CONSTRAINT_NAME;
-- Expected: 6 rows (fk_pvcal_evidence, fk_pvcal_variant, fk_pvce_product, fk_pvce_variant, fk_pvcle_product, fk_pvcle_variant), all with DELETE_RULE = 'RESTRICT'

-- 5.2 Re-verify catalog counts & 9 historical conflicts (zero drift)
SELECT
    COUNT(*) AS total_variants,
    SUM(CASE WHEN caliper_um IS NOT NULL THEN 1 ELSE 0 END) AS with_caliper,
    SUM(CASE WHEN caliper_um IS NULL THEN 1 ELSE 0 END) AS missing_caliper,
    SUM(CASE WHEN id IN (
        'var_2b0314c68f5a97c7','var_7b7e3a2a2a4a0313','var_4178aecbfa53dcf8',
        'var_c699e6a51cd6b41f','var_5f5cae75e6f45671','var_ae7dbf443ceab19a',
        'var_9dabfd7ac5eff6ca','var_06e1d1681e4f0989','var_e2f2e68304e9d4a1'
    ) AND caliper_um IS NULL THEN 1 ELSE 0 END) AS protected_conflicts_null
FROM paper_variants;
-- Expected: 1524 / 1272 / 252 / 9
```

---

## Phase 6 — Authenticated Smoke Tests

After restarting/reloading the Control Plane service, execute read-only authenticated smoke checks:

```bash
# 6.1 Verify missing-materials summary KPIs (1524 / 1272 / 252 / 145 / 102 / 5 / 337)
curl -sS -H "Authorization: Bearer $SUPPLIER_ADMIN_JWT" \
  "https://control.printprice.pro/api/v1/paper-suppliers/accreditation/missing-materials?page=1&limit=5" \
  | jq '.data.summary'

# 6.2 Verify variant evidence & 5-tier Spine provenance endpoint
curl -sS -H "Authorization: Bearer $SUPPLIER_ADMIN_JWT" \
  "https://control.printprice.pro/api/v1/paper-suppliers/accreditation/variants/var_dbd5357075534e3b/evidences" \
  | jq '{variant: .data.variant, spineProvenance: .data.spineProvenance}'

# 6.3 Verify unauthenticated access fails closed with 401
curl -sS -o /dev/null -w "%{http_code}\n" \
  "https://control.printprice.pro/api/v1/paper-suppliers/accreditation/missing-materials"
# Expected: 401
```

---

## Phase 7 — Deterministic Rollback Procedure

If any anomaly is detected during post-migration validation (prior to registering production accreditation evidences), execute the deterministic rollback script:

```bash
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  < migrations/rollback/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql
```

This drops `paper_variant_classification_evidence`, `paper_variant_caliper_audit_log`, and `paper_variant_caliper_evidence` cleanly in reverse dependency order without affecting `paper_variants`, `paper_products`, `supplier_paper_catalog_variants`, or `supplier_paper_offers`.
