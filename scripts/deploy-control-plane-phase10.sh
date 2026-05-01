#!/bin/bash
# -----------------------------------------------------------------------------
# PrintPrice OS Control Plane — Deployment Script (Phase 10)
# 
# Safe deployment for Plesk/Passenger/PM2 environments.
# -----------------------------------------------------------------------------

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

LOG_FILE="deploy_$(date +%Y%m%d_%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[DEPLOY] Starting Phase 10 Industrial Operations Deployment..."
echo "[DEPLOY] Timestamp: $(date)"
echo "[DEPLOY] App Dir: $APP_DIR"

# 1. Environment Verification
if [ ! -f ".env" ]; then
    echo "[ERROR] Missing .env file. Aborting."
    exit 1
fi

# 2. Backup Current State
echo "[DEPLOY] Backing up current dist/ and config..."
mkdir -p backups
tar -czf "backups/dist_backup_$(date +%Y%m%d_%H%M%S).tar.gz" dist/ 2>/dev/null || true

# 3. Pull Latest Changes
echo "[DEPLOY] Fetching latest from phase-10-intelligence-layer..."
git fetch origin
git checkout phase-10-intelligence-layer
git pull origin phase-10-intelligence-layer

# 4. Install Dependencies
echo "[DEPLOY] Installing dependencies..."
npm ci

# 5. Production Build
echo "[DEPLOY] Building frontend..."
if ! npm run build; then
    echo "[ERROR] Frontend build failed. Aborting."
    exit 1
fi

# 6. Schema Verification & Migration
echo "[DEPLOY] Verifying database schema..."
if ! node scripts/verify-industrial-schema.js; then
    echo "[WARN] Schema verification failed. Attempting to apply migrations..."
    # In a real environment, we would prompt or use a migration tool.
    # Here we point to the SQL file.
    echo "[INFO] Please execute: mysql -h \$PPOS_DB_HOST -u \$PPOS_DB_USER -p \$PPOS_DB_NAME < docs/migrations/phase10_industrial_operations.sql"
    # For automation safety, we don't auto-run the SQL unless PPOS_AUTO_MIGRATE=true
    if [ "${PPOS_AUTO_MIGRATE:-false}" = "true" ]; then
        echo "[DEPLOY] Executing auto-migration..."
        # Simplified execution for example
        mysql -h "$PPOS_DB_HOST" -u "$PPOS_DB_USER" -p"$PPOS_DB_PASSWORD" "$PPOS_DB_NAME" < docs/migrations/phase10_industrial_operations.sql
    fi
fi

# 7. Smoke Test (Pre-Restart)
# We can't really smoke test the new backend until it's running, 
# but we can check if the build artifacts exist.
if [ ! -f "dist/index.html" ]; then
    echo "[ERROR] dist/index.html missing after build. Aborting."
    exit 1
fi

# 8. PM2 Restart
echo "[DEPLOY] Restarting PM2 process..."
if command -v pm2 &> /dev/null; then
    pm2 restart ecosystem.config.js || pm2 restart ppos-control-plane
else
    echo "[WARN] PM2 not found. Please restart the process manually (e.g., touch tmp/restart.txt for Passenger)."
    mkdir -p tmp
    touch tmp/restart.txt
fi

# 9. Final Smoke Test
echo "[DEPLOY] Running post-deploy smoke tests..."
# Wait for boot
sleep 5
if ! node scripts/smoke-control-plane-industrial.js; then
    echo "[CRITICAL] Post-deploy smoke test FAILED."
    echo "[ROLLBACK] Please refer to docs/rollback-phase10-industrial.md"
    exit 1
fi

echo "[DEPLOY] SUCCESS. Phase 10 Industrial Operations is LIVE."
echo "[DEPLOY] Log: $LOG_FILE"
