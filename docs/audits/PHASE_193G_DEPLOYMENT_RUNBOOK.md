# PHASE 193G — PRODUCTION DEPLOYMENT & VERIFICATION RUNBOOK
## Controlled Execution Sequence for Phase 193 Deployment

> **Target Environment**: Production Server (`control.printprice.pro`)  
> **Source Commit**: `bba4578f57f44934a7760688cfb77ff0afea5c85` (Tag `phase-193f-quick-pricing-calibration-ui`)  
> **Pre-requisite**: Explicit deployment window authorization.

---

### Step 1: Pre-Deployment State Capture & Backups

```bash
# 1. Capture current production source commit
cd /opt/printprice-os/ppos-control-plane
git rev-parse HEAD > /opt/backups/pre_193_source_commit.txt
git status --short > /opt/backups/pre_193_git_status.txt

# 2. Fresh production database backup (MANDATORY BEFORE MIGRATIONS)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mysqldump -u root -p printprice_os_production \
  --single-transaction \
  --quick \
  --routines \
  --triggers > /opt/backups/db_pre_phase193_${TIMESTAMP}.sql

# Verify backup integrity
sha256sum /opt/backups/db_pre_phase193_${TIMESTAMP}.sql > /opt/backups/db_pre_phase193_${TIMESTAMP}.sql.sha256
ls -lh /opt/backups/db_pre_phase193_${TIMESTAMP}.sql

# 3. Backup current frontend httpdocs
tar -czf /opt/backups/httpdocs_pre_phase193_${TIMESTAMP}.tar.gz -C /var/www/vhosts/printprice.pro/control.printprice.pro httpdocs
```

---

### Step 2: Source Update & Private Git Dependency Verification

```bash
cd /opt/printprice-os/ppos-control-plane

# 1. Fetch remote and checkout exact canonical tag
git fetch origin --tags
git checkout phase-193f-quick-pricing-calibration-ui

# 2. Verify commit SHA matches exactly
[ "$(git rev-parse HEAD)" = "bba4578f57f44934a7760688cfb77ff0afea5c85" ] && echo "COMMIT SHA MATCH: OK" || echo "SHA MISMATCH: ABORT"

# 3. Deterministic package installation (including private Git BPE commit 8d324290...)
npm ci

# 4. Verify @ppos/pricing-engine loaded cleanly
node -e "const bpe = require('@ppos/pricing-engine'); console.log('BPE loaded successfully, buildPrice is', typeof bpe.buildPrice);"
```

---

### Step 3: Governed Database Migration Sequence (146 -> 147 -> 148)

```bash
# 1. Apply Migration 146
node scripts/apply_single_migration.js migrations/146_phase193b_calibration_session_foundation.sql

# 2. Apply Migration 147
node scripts/apply_single_migration.js migrations/147_phase193c_calibration_runs.sql

# 3. Apply Migration 148
node scripts/apply_single_migration.js migrations/148_phase193d_governed_pricing_acceptance.sql

# 4. Verify migration ledger & zero-data-mutation check
node scripts/smoke_phase183_migration_integrity.js
```

---

### Step 4: Frontend Production Build & Atomic Asset Swap

```bash
# 1. Build Vite production bundle
npm run build

# 2. Atomically copy dist assets to httpdocs
rsync -av --delete dist/ /var/www/vhosts/printprice.pro/control.printprice.pro/httpdocs/

# 3. Set proper permissions
chown -R www-data:www-data /var/www/vhosts/printprice.pro/control.printprice.pro/httpdocs/
chmod -R 755 /var/www/vhosts/printprice.pro/control.printprice.pro/httpdocs/
```

---

### Step 5: PM2 Process Reload & Post-Deploy Health Check

```bash
# 1. Graceful PM2 reload
pm2 reload ppos-control-plane --update-env

# 2. Inspect PM2 logs for clean boot
pm2 logs ppos-control-plane --lines 40 --nostream

# 3. Execute backend post-deploy smoke
node tests/smoke_phase193e_conversational_assistant.js
node tests/smoke_phase193d_governed_acceptance.js
```

---

### Step 6: Controlled Production E2E Smoke (Test/Beta Node)

1. Log into Control Plane via `https://control.printprice.pro`.
2. Navigate to **Guided Setup / Pricing** tab for designated beta node.
3. Verify `Quick Pricing Calibration` panel is rendered above the manual editor.
4. Input a test book description into chat: *"1000 copies, 170x240mm, 128p 4/4 offset, 300g cover, perfect bound for €2,450"*.
5. Verify proposal is rendered in memory without auto-saving.
6. Click `[ Apply Extracted Details ]` and verify session transitions cleanly.
7. Click `[ Ready to Calibrate ]` $\to$ click `[ Calculate Starting Pricing ]`.
8. Review solver residual, rate diffs, and AI explanation.
9. **STOP before Accept** or perform controlled acceptance on beta node.
10. Confirm zero impact on active customer quotes or unassigned marketplace orders.
