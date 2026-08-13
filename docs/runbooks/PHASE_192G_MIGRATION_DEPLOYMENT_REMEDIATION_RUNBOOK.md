# docs/runbooks/PHASE_192G_MIGRATION_DEPLOYMENT_REMEDIATION_RUNBOOK.md

## Phase 192G — Migration Engine Remediation & Recovery Runbook (RC3)

### Version: 3.0 — 2026-08-13
**Status**: APPROVED FOR STAGE 1 COHORT BETA USE ONLY

---

## 1. Context & Operational Evidence
During the deployment attempt of Phase 192 RC1, migration 136 (`136_phase190_order_pricing_snapshot_sealing.sql`) failed due to delimiter syntax in stored procedures and trigger declarations which the legacy naive splitting logic (`content.split(';')`) was unable to parse.

Current target server database state:
- `schema_versions` has migration 136 in state `FAILED` (with error `ER_PARSE_ERROR`).
- `order_pricing_snapshots` table exists (partial side effect).
- All columns added to `orders` or `job_quotes` by 136 are **NOT** present.
- All triggers in 136 are **NOT** present.
- Migrations 137–145 are **NOT** applied.

Additionally, database credentials exposed during diagnostics must be rotated immediately before restarting production node runtimes.

---

## 2. Intended Production Recovery Sequence

Follow this runbook step-by-step. Do not bypass any verification checks.

### Step 1: Rotate MySQL Credentials Outside Git
Connect to the production MySQL server host and run the rotation query:
```sql
ALTER USER 'controlplane'@'localhost' IDENTIFIED BY 'NEW_COMPLEX_PASSWORD';
FLUSH PRIVILEGES;
```
*Note: Replace `NEW_COMPLEX_PASSWORD` with a newly-generated cryptographically secure password. Do NOT commit this password to git.*

### Step 2: Update Production .env Config Outside Git
Edit the untracked `.env` file on the production host to update database connection strings:
```bash
# Update both discrete password variable and DATABASE_URL
DATABASE_URL=mysql://controlplane:NEW_COMPLEX_PASSWORD@localhost:3306/Control
MYSQL_PASSWORD=NEW_COMPLEX_PASSWORD
```

Verify that the local node can connect to MySQL with the new password:
```bash
node -e "const db = require('./src/api/services/mysqlClient'); db.query('SELECT 1').then(() => console.log('Connected!')).catch(console.error)"
```

### Step 3: Fetch and Deploy Release Candidate 3 (RC3)
Check out the corrected release candidate codebase on the target node:
```bash
git fetch origin
git checkout tags/phase-192-controlled-beta-rc3
```

Verify that tag and HEAD point to the exact same commit:
```bash
git rev-parse HEAD
git rev-list -n 1 phase-192-controlled-beta-rc3
```
*Expected: Identical commit SHAs.*

### Step 4: Run Node Dependency and Build Bootstraps
Verify dependencies and build the static frontend bundle:
```bash
npm ci
npm run build
```

### Step 5: Local Integrity & Checksum Verification
Validate that all local migration files match the baseline registry:
```bash
npm run migration:integrity
```
*Expected Output:* `Phase 183: PASSED`

### Step 6: Run Database Dry-Run Diagnostic
Check the ledger status before executing any database mutations:
```bash
node scripts/run_control_plane_migrations.js --dry-run
```
*Expected Output:*
- Failed migrations: `1` (migration 136)
- Ledger status: `PENDING_MIGRATIONS` (Since `PPOS_ALLOW_MIGRATION_RETRY=true` allows retry of the failed migration).
- Exit Code: `2` (Pending migrations exist)

### Step 7: Perform Explicit Governed Retry
Execute the migrations with retry governance enabled:
```bash
# Set explicit retry authorization environment variable
$env:PPOS_ALLOW_MIGRATION_RETRY="true"

# Execute migration cli runner
node scripts/run_control_plane_migrations.js
```
*Expected execution path:*
1. The engine acquires the database advisory lock.
2. It detects the `FAILED` state of migration 136.
3. Since `PPOS_ALLOW_MIGRATION_RETRY` is `true`, it compares the local checksum of 136 with the failed record's checksum.
4. On match, it preserves the previous failure detail into the `previous_failures` JSON column and sets state to `STARTED`.
5. It parses migration 136 using the new deterministic parser (respecting `DELIMITER $$`).
6. It safely skips the duplicate table creation `order_pricing_snapshots` (idempotent bypass).
7. It creates the remaining columns on `orders` and `job_quotes`.
8. It successfully creates the immutability/consistency triggers, ignoring duplicate errors if any exist.
9. On success, it marks migration 136 as `APPLIED`.
10. The engine proceeds to apply pending migrations 137–145 in numerical order.

### Step 8: Verification of Applied Migrations
Confirm that all 145 migrations are marked as `APPLIED` in the ledger:
```bash
node scripts/run_control_plane_migrations.js --dry-run
```
*Expected Output:*
- Ledger status: `READY`
- Exit Code: `0`

Validate the schema integrity of triggers and tables:
```sql
-- Connect to MySQL and run:
SHOW TABLES LIKE 'order_pricing_snapshots';
SHOW COLUMNS FROM orders LIKE 'active_pricing_snapshot_id';
SHOW TRIGGERS LIKE 'order_pricing_snapshots';
```

### Step 9: Restart PM2 and Verify Readiness
Update PM2 environment and restart the runtime process:
```bash
pm2 restart all --update-env
curl http://127.0.0.1:8081/api/admin/runtime/health
```

---

## 3. Append-Only Ledger Constraint
Once all migrations reach the `APPLIED` state, no historic migration files (001–145) may be modified. Any future schema alterations must use a new sequential file (146+).

---
**RUNBOOK_VERSION**: 3.0
