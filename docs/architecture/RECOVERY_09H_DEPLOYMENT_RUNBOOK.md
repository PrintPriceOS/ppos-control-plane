# RECOVERY-09H — Production Deployment Runbook & Readiness Procedure

**Mission:** `ORDER RECOVERY-09H-FINAL — Corrección de preflight y autorización de despliegue`  
**Repository:** `PrintPriceOS/ppos-control-plane`  
**Target Environment:** `MySQL Control` (Production for Testers) + `Control Plane` (`control.printprice.pro`)  
**Migration File:** [`migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql)  
**Rollback File:** [`migrations/rollback/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/migrations/rollback/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql)  
**Execution Status:** **`READ-ONLY PREFLIGHT CERTIFIED IN PRODUCTION (Migration 174 NOT applied, Control Plane NOT restarted)`**  
**Preflight Verdict:** **`RECOVERY_09H_FINAL_PREFLIGHT_PASS`**

---

## 0. Governed Invariants & Safety Gates

Before, during, and after executing this runbook in production, the following invariants are **strictly enforced**:
1. **Zero Caliper Mutation by Migration 174:** Migration `174` is 100% additive (`CREATE TABLE IF NOT EXISTS` for 3 tables) and issues **zero `UPDATE` or `ALTER` statements** on `paper_variants` or `paper_products`.
2. **Catalog Baseline Preservation (`1,524 = 1,272 + 252`):**
   - Total `paper_variants`: **`1,524`**
   - Variants with caliper present (`caliper_um IS NOT NULL AND caliper_um > 0`): **`1,272`** (`83.46%`)
   - Variants missing caliper (`caliper_um IS NULL`): **`252`** (`16.54%`)
   - **9 Historical Conflicts Preserved (Included within the `1,272` variants with caliper, NEVER counted among the `252` missing calipers):**
     - **5 `Amber Graphic 100 gsm` variants (`122.00 µm` preserved vs `119.00 µm` ODS):** `var_2b0314c68f5a97c7`, `var_4178aecbfa53dcf8`, `var_5f5cae75e6f45671`, `var_7b7e3a2a2a4a0313`, `var_c699e6a51cd6b41f`.
     - **4 `Galerie Art Matt 250 gsm` variants (`225.00 µm` preserved vs `257.00 µm` ODS):** `var_06e1d1681e4f0989`, `var_9dabfd7ac5eff6ca`, `var_ae7dbf443ceab19a`, `var_e2f2e68304e9d4a1`.
     - All 9 maintain `caliper_source = 'LIVONIA_REFERENCE_IMPORT'`, `caliper_confidence_status = 'REFERENCE_IMPORTED'`, and their conflict traceability in `paper_caliper_reconciliation_candidates.notes` (`[ODS Conflict: ...]`).
   - Effective pending technical classifications (`G1..G6`): **`337`**
3. **Referential Integrity (`ON DELETE RESTRICT`):** All 6 foreign keys across `paper_variant_caliper_evidence`, `paper_variant_caliper_audit_log`, and `paper_variant_classification_evidence` enforce `ON DELETE RESTRICT`.
4. **Industrial Release Lock:** `canReleaseToManufacturing` remains **`false`**; approval of evidence never mutates `paper_variants.caliper_um` (`productiveCaliperModified: false`).
5. **Operational Security (Zero Credential Exposure):** Database operations must never pass `-u` or `-p"$DB_PASSWORD"` on the command line (which exposes secrets in `ps aux`, shell history, and logs). All connections must use either the application's internal `mysqlClient` pool (loaded from `.env.production` with `0600` permissions) or a temporary `0600` `--defaults-extra-file` removed immediately via `trap 'rm -f "$MYSQL_CNF"' EXIT`.

---

## Phase 1 — Read-Only Production Schema & Catalog Preflight

### 1.1 Exact SQL Verification Queries (No CLI Credential Exposure)

Run the following read-only verification against `MySQL Control` via the internal `mysqlClient` pool or a protected `--defaults-extra-file`:

```sql
-- 1.1a Verify global catalog counts & confirm the 9 historical conflicts are within the 1,272 with-caliper rows (0 in the 252 missing)
SELECT
    COUNT(*) AS total_variants,
    SUM(CASE WHEN caliper_um IS NOT NULL AND caliper_um > 0 THEN 1 ELSE 0 END) AS with_caliper,
    SUM(CASE WHEN caliper_um IS NULL OR caliper_um <= 0 THEN 1 ELSE 0 END) AS missing_caliper,
    SUM(CASE WHEN id IN (
        'var_2b0314c68f5a97c7','var_4178aecbfa53dcf8','var_5f5cae75e6f45671',
        'var_7b7e3a2a2a4a0313','var_c699e6a51cd6b41f','var_06e1d1681e4f0989',
        'var_9dabfd7ac5eff6ca','var_ae7dbf443ceab19a','var_e2f2e68304e9d4a1'
    ) AND caliper_um IS NOT NULL AND caliper_um > 0 THEN 1 ELSE 0 END) AS historical_9_with_caliper,
    SUM(CASE WHEN id IN (
        'var_2b0314c68f5a97c7','var_4178aecbfa53dcf8','var_5f5cae75e6f45671',
        'var_7b7e3a2a2a4a0313','var_c699e6a51cd6b41f','var_06e1d1681e4f0989',
        'var_9dabfd7ac5eff6ca','var_ae7dbf443ceab19a','var_e2f2e68304e9d4a1'
    ) AND (caliper_um IS NULL OR caliper_um <= 0) THEN 1 ELSE 0 END) AS historical_9_in_missing_252,
    SUM(CASE WHEN id IN (
        'var_2b0314c68f5a97c7','var_4178aecbfa53dcf8','var_5f5cae75e6f45671',
        'var_7b7e3a2a2a4a0313','var_c699e6a51cd6b41f'
    ) AND caliper_um = 122.00
      AND caliper_source = 'LIVONIA_REFERENCE_IMPORT'
      AND caliper_confidence_status = 'REFERENCE_IMPORTED' THEN 1 ELSE 0 END) AS amber_graphic_122um_count,
    SUM(CASE WHEN id IN (
        'var_06e1d1681e4f0989','var_9dabfd7ac5eff6ca','var_ae7dbf443ceab19a','var_e2f2e68304e9d4a1'
    ) AND caliper_um = 225.00
      AND caliper_source = 'LIVONIA_REFERENCE_IMPORT'
      AND caliper_confidence_status = 'REFERENCE_IMPORTED' THEN 1 ELSE 0 END) AS galerie_art_matt_225um_count
FROM paper_variants;
-- Expected:
--   total_variants = 1524
--   with_caliper = 1272
--   missing_caliper = 252
--   historical_9_with_caliper = 9
--   historical_9_in_missing_252 = 0
--   amber_graphic_122um_count = 5
--   galerie_art_matt_225um_count = 4

-- 1.1b Individual verification of the 9 historical conflicts and their conflict traceability notes
SELECT
    v.id AS variant_id,
    v.product_id,
    p.name AS product_name,
    v.gsm,
    v.width_mm,
    v.height_mm,
    v.caliper_um,
    v.caliper_source,
    v.caliper_confidence_status,
    c.reconciliation_status,
    c.review_decision,
    c.notes AS conflict_notes
FROM paper_variants v
JOIN paper_products p ON p.id = v.product_id
LEFT JOIN paper_caliper_reconciliation_candidates c ON c.variant_id = v.id
WHERE v.id IN (
    'var_2b0314c68f5a97c7','var_4178aecbfa53dcf8','var_5f5cae75e6f45671',
    'var_7b7e3a2a2a4a0313','var_c699e6a51cd6b41f','var_06e1d1681e4f0989',
    'var_9dabfd7ac5eff6ca','var_ae7dbf443ceab19a','var_e2f2e68304e9d4a1'
)
ORDER BY v.gsm ASC, v.id ASC;

-- 1.1c Verify whether Migration 174 tables exist yet
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

### 1.2 Live Read-Only Preflight Results Verified in `MySQL Control` (`2026-10-29T11:59:09.799Z`)

Executed in strict read-only mode against `MySQL Control` (`localhost/Control` via `src/api/services/mysqlClient.js`):

- **Global Catalog Counters:**
  - `total_variants`: **`1,524`**
  - `with_caliper` (`caliper_um > 0`): **`1,272`** (`83.46%`)
  - `missing_caliper` (`caliper_um IS NULL`): **`252`** (`16.54%`)
  - `historical_9_with_caliper`: **`9`**
  - `historical_9_in_missing_252`: **`0`** (zero overlap with the `252` missing calipers)
  - `amber_graphic_122um_count`: **`5`**
  - `galerie_art_matt_225um_count`: **`4`**
  - `verified_count` (`caliper_confidence_status = 'VERIFIED'`): **`0`**
  - `migration174TablesPresentCount`: **`0`**

- **Individual Verification of the 9 Historical Conflicts in Production:**

| # | `variant_id` | `product_id` | Product Name | GSM | Format (mm) | `caliper_um` | `caliper_source` | `caliper_confidence_status` | Preserved Conflict Info (`paper_caliper_reconciliation_candidates.notes`) | Status |
|---:|---|---|---|---:|---|---:|---|---|---|---|
| 1 | `var_2b0314c68f5a97c7` | `prod_6b947230ea5a4912` | `Amber Graphic 100 102x72` | 100 | `1020x720` | **`122.00 µm`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 15 has 119.00 um vs existing Livonia 122.00 um; existing preserved]` | **PASS** |
| 2 | `var_4178aecbfa53dcf8` | `prod_cdd3b22491fa9ecc` | `Amber Graphic 100 72x102 FSC` | 100 | `720x1020` | **`122.00 µm`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 17 has 119.00 um vs existing Livonia 122.00 um; existing preserved]` | **PASS** |
| 3 | `var_5f5cae75e6f45671` | `prod_ed3fbeb4b1a89563` | `Amber Graphic 100 90x64 FSC` | 100 | `900x640` | **`122.00 µm`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 19 has 119.00 um vs existing Livonia 122.00 um; existing preserved]` | **PASS** |
| 4 | `var_7b7e3a2a2a4a0313` | `prod_054ee8c967a27de8` | `Amber Graphic 100 64x90 FSC` | 100 | `640x900` | **`122.00 µm`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 16 has 119.00 um vs existing Livonia 122.00 um; existing preserved]` | **PASS** |
| 5 | `var_c699e6a51cd6b41f` | `prod_936f69acbe1c2a6d` | `Amber Graphic 100 88x63` | 100 | `880x630` | **`122.00 µm`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 18 has 119.00 um vs existing Livonia 122.00 um; existing preserved]` | **PASS** |
| 6 | `var_06e1d1681e4f0989` | `prod_d02da3987156443d` | `Galerie Art Matt 250 72x102 FSC` | 250 | `720x1020` | **`225.00 µm`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 464 has 257.00 um vs existing Livonia 225.00 um; existing preserved]` | **PASS** |
| 7 | `var_9dabfd7ac5eff6ca` | `prod_f15422a92558577d` | `Galerie Art Matt 250 64x90 FSC` | 250 | `640x900` | **`225.00 µm`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 463 has 257.00 um vs existing Livonia 225.00 um; existing preserved]` | **PASS** |
| 8 | `var_ae7dbf443ceab19a` | `prod_d84abf47ed966f7e` | `Galerie Art Matt 250 46x64 FSC` | 250 | `460x640` | **`225.00 µm`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 462 has 257.00 um vs existing Livonia 225.00 um; existing preserved]` | **PASS** |
| 9 | `var_e2f2e68304e9d4a1` | `prod_3ec85f555b572ac8` | `Galerie Art Matt 250 90x64 FSC` | 250 | `900x640` | **`225.00 µm`** | `LIVONIA_REFERENCE_IMPORT` | `REFERENCE_IMPORTED` | `[ODS Conflict: row 465 has 257.00 um vs existing Livonia 225.00 um; existing preserved]` | **PASS** |

- **Production Table Checksums Verified (Read-Only):**
  - `Control.paper_products`: `1734492320`
  - `Control.paper_variants`: `2093607442`
  - `Control.supplier_paper_offers`: `3737849396`
  - `Control.paper_technical_caliper_reference`: `2847849606`
  - `Control.paper_caliper_reconciliation_candidates`: `3402454981`

Also verify Phase 183 migration integrity baseline before deployment:

```bash
node scripts/smoke_phase183_migration_integrity.js
# Expected: Phase 183: PASSED (177 baselined migrations, 0 drift errors)
```

---

## Phase 2 — Pre-Migration Backup & Cryptographic `SHA-256` Manifest (Zero Credential Exposure)

Never pass database credentials in CLI arguments (`-u` / `-p`). Instead, generate an ephemeral `0600` MySQL client option file (`--defaults-extra-file`) parsed internally from `.env.production` and automatically destroyed on script exit (`trap 'rm -f "$MYSQL_CNF"' EXIT`):

```bash
BACKUP_DIR="/var/backups/ppos/recovery_09h_$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

MYSQL_CNF="$(mktemp /tmp/.ppos_mysql_XXXXXX.cnf)"
chmod 600 "$MYSQL_CNF"
trap 'rm -f "$MYSQL_CNF"' EXIT

node -e '
  const fs = require("fs");
  const dotenv = require("/opt/printprice-os/ppos-control-plane/node_modules/dotenv");
  if (fs.existsSync("/opt/printprice-os/ppos-control-plane/.env.production")) {
    dotenv.config({ path: "/opt/printprice-os/ppos-control-plane/.env.production" });
  }
  if (fs.existsSync("/opt/printprice-os/ppos-control-plane/.env")) {
    dotenv.config({ path: "/opt/printprice-os/ppos-control-plane/.env" });
  }
  const u = new URL(process.env.DATABASE_URL);
  const cnf = [
    "[client]",
    "host=" + u.hostname,
    "port=" + (u.port || "3306"),
    "user=" + decodeURIComponent(u.username),
    "password=" + JSON.stringify(decodeURIComponent(u.password))
  ].join("\n") + "\n";
  fs.writeFileSync(process.argv[1], cnf, { mode: 0o600 });
' "$MYSQL_CNF"

DB_NAME="Control"

mysqldump --defaults-extra-file="$MYSQL_CNF" \
  --single-transaction --routines --triggers \
  "$DB_NAME" paper_products paper_variants supplier_paper_catalog_variants supplier_paper_offers paper_caliper_reconciliation_candidates \
  > "$BACKUP_DIR/pre_migration_174_catalog_backup.sql"

sha256sum "$BACKUP_DIR/pre_migration_174_catalog_backup.sql" \
  migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql \
  migrations/rollback/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql \
  > "$BACKUP_DIR/SHA256SUMS.manifest"

chmod 600 "$BACKUP_DIR"/*
cat "$BACKUP_DIR/SHA256SUMS.manifest"
```

---

## Phase 3 — Private PDF Evidence Store Provisioning & PM2 User Verification

The active PM2 process `ppos-control-plane` (`pm_id: 0`, `cwd: /opt/printprice-os/ppos-control-plane`) runs under effective user `root` (`uid=0`, `gid=0`). Both private PDF storage paths have been verified on the production host with `0700` permissions and full `R_OK | W_OK | X_OK` access for the effective PM2 user:

| Directory Path | Owner (`uid:gid`) | Permissions (`Octal`) | Effective PM2 User (`root`) `RWX` Access |
|---|---|---|---|
| `/var/lib/ppos/private_evidence_store` | `0:0` (`root:root`) | **`0700`** | **`true` (`PASS`)** |
| `/opt/printprice-os/ppos-control-plane/var/private_evidence_store` | `0:0` (`root:root`) | **`0700`** | **`true` (`PASS`)** |

To provision or verify ownership dynamically against the active PM2 process user during deployment:

```bash
PM2_USER="$(pm2 jlist | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); const p=d.find(x=>x.name==="ppos-control-plane")||d[0]; process.stdout.write(p.pm2_env.username||"root");')"
export PAPER_EVIDENCE_STORAGE_DIR="/var/lib/ppos/private_evidence_store"
mkdir -p "$PAPER_EVIDENCE_STORAGE_DIR" "/opt/printprice-os/ppos-control-plane/var/private_evidence_store"
chown "$PM2_USER:$PM2_USER" "$PAPER_EVIDENCE_STORAGE_DIR" "/opt/printprice-os/ppos-control-plane/var/private_evidence_store"
chmod 700 "$PAPER_EVIDENCE_STORAGE_DIR" "/opt/printprice-os/ppos-control-plane/var/private_evidence_store"
```

---

## Phase 4 — Controlled Execution of Migration 174 (No CLI Credential Exposure)

1. **Dry-Run Baseline Verification:**
   ```bash
   node scripts/smoke_phase183_migration_integrity.js
   ```
2. **Apply Migration `174` via Internal Node Pool or `--defaults-extra-file`:**
   ```bash
   mysql --defaults-extra-file="$MYSQL_CNF" "$DB_NAME" \
     < migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql
   ```

---

## Phase 5 — Post-Migration Schema & Referential Integrity Validation

Immediately verify that all 3 tables exist, all 6 foreign keys enforce `DELETE_RULE = 'RESTRICT'`, and the `1,524` catalog rows (`1,272` with caliper including the `9` historical conflicts, and `252` missing caliper) remain 100% untouched:

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
    SUM(CASE WHEN caliper_um IS NOT NULL AND caliper_um > 0 THEN 1 ELSE 0 END) AS with_caliper,
    SUM(CASE WHEN caliper_um IS NULL OR caliper_um <= 0 THEN 1 ELSE 0 END) AS missing_caliper,
    SUM(CASE WHEN id IN (
        'var_2b0314c68f5a97c7','var_4178aecbfa53dcf8','var_5f5cae75e6f45671',
        'var_7b7e3a2a2a4a0313','var_c699e6a51cd6b41f'
    ) AND caliper_um = 122.00
      AND caliper_source = 'LIVONIA_REFERENCE_IMPORT'
      AND caliper_confidence_status = 'REFERENCE_IMPORTED' THEN 1 ELSE 0 END) AS amber_graphic_122um_count,
    SUM(CASE WHEN id IN (
        'var_06e1d1681e4f0989','var_9dabfd7ac5eff6ca','var_ae7dbf443ceab19a','var_e2f2e68304e9d4a1'
    ) AND caliper_um = 225.00
      AND caliper_source = 'LIVONIA_REFERENCE_IMPORT'
      AND caliper_confidence_status = 'REFERENCE_IMPORTED' THEN 1 ELSE 0 END) AS galerie_art_matt_225um_count,
    SUM(CASE WHEN id IN (
        'var_2b0314c68f5a97c7','var_4178aecbfa53dcf8','var_5f5cae75e6f45671',
        'var_7b7e3a2a2a4a0313','var_c699e6a51cd6b41f','var_06e1d1681e4f0989',
        'var_9dabfd7ac5eff6ca','var_ae7dbf443ceab19a','var_e2f2e68304e9d4a1'
    ) AND (caliper_um IS NULL OR caliper_um <= 0) THEN 1 ELSE 0 END) AS historical_9_in_missing_252
FROM paper_variants;
-- Expected: 1524 / 1272 / 252 / 5 / 4 / 0
```

---

## Phase 6 — Authenticated Smoke Tests

After restarting/reloading the Control Plane service upon deployment approval, execute read-only authenticated smoke checks:

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

## Phase 7 — Deterministic Rollback Procedure (No CLI Credential Exposure)

If any anomaly is detected during post-migration validation (prior to registering production accreditation evidences), execute the deterministic rollback script using `--defaults-extra-file`:

```bash
mysql --defaults-extra-file="$MYSQL_CNF" "$DB_NAME" \
  < migrations/rollback/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql
```

This drops `paper_variant_classification_evidence`, `paper_variant_caliper_audit_log`, and `paper_variant_caliper_evidence` cleanly in reverse dependency order without affecting `paper_variants`, `paper_products`, `supplier_paper_catalog_variants`, or `supplier_paper_offers`.
