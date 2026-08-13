# docs/runbooks/PHASE_192G_MIGRATION_DEPLOYMENT_REMEDIATION_RUNBOOK.md

## Phase 192G — Migration Engine Remediation & Recovery Runbook (RC6)

### Version: 6.0 — 2026-08-13
**Status**: APPROVED FOR STAGE 1 COHORT BETA USE ONLY

---

## 1. Context & Operational Evidence
In the production environment, migrations 136, 137, 138, and 139 have successfully been applied. However, migration 140 (`140_phase191e_materials_capacity_leadtimes.sql`) failed with error `ER_FK_INCOMPATIBLE_COLUMNS` due to key length and character set/collation mismatches between legacy columns (e.g. `printer_nodes.id` as `utf8mb3_general_ci` / `VARCHAR(36)`) and the new capacity table schemas (created in `utf8mb4_unicode_ci` / `VARCHAR(50)`).

Current target server database state:
- `schema_versions` has migration 140 in state `FAILED`.
- Tables `printhouse_machine_materials`, `printhouse_site_capacities`, and `printhouse_site_lead_times` are **NOT** created.
- Capacity columns on `printhouse_machines` are **NOT** created.
- Migrations 141–145 remain **NOT APPLIED**.

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

### Step 3: Fetch and Deploy Release Candidate 6 (RC6)
Check out the corrected release candidate codebase on the target node:
```bash
git fetch origin
git checkout tags/phase-192-controlled-beta-rc6
```

Verify that tag and HEAD point to the exact same commit:
```bash
git rev-parse HEAD
git rev-list -n 1 phase-192-controlled-beta-rc6
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
- Failed migrations: `1` (migration 140)
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
2. It detects the `FAILED` state of migration 140.
3. Since `PPOS_ALLOW_MIGRATION_RETRY` is `true`, it compares the local checksum of 140 with the failed record's checksum.
4. On match, the engine automatically executes `runMigration140PreRemediation` DDL helper to:
   - Identify which of the 13 legacy foreign keys exist.
   - Drop only those active legacy foreign keys.
   - Widen and convert all 22 parent/child columns to `VARCHAR(50)`/`VARCHAR(64)` and `utf8mb4`/`utf8mb4_unicode_ci` (preserving nullability exactly).
   - Recreate all 13 legacy foreign keys with their exact original names and ON UPDATE/ON DELETE rules.
   - Restore `FOREIGN_KEY_CHECKS = 1`.
5. The engine preserves the previous failure detail of 140 into the `previous_failures` JSON column and sets state to `STARTED`.
6. It executes the statements in migration 140 (which now pass with 100% type/referential compatibility).
7. On success, it marks migration 140 as `APPLIED`.
8. The engine proceeds to apply pending migrations 141–145 in numerical order.

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
SHOW TABLES LIKE 'printhouse_machine_materials';
SHOW TABLES LIKE 'printhouse_site_capacities';
SHOW TABLES LIKE 'printhouse_site_lead_times';
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
**RUNBOOK_VERSION**: 6.0
