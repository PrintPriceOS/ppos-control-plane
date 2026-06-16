#!/bin/bash
# -----------------------------------------------------------------------------
# PrintPrice OS Control Plane — Deployment Script (Phase 10 & 39)
# 
# Safe deployment for Plesk/Passenger/PM2 environments.
# -----------------------------------------------------------------------------

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

LOG_FILE="deploy_$(date +%Y%m%d_%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[DEPLOY] Starting Phase 39 Control Plane Deployment..."
echo "[DEPLOY] Timestamp: $(date)"
echo "[DEPLOY] App Dir: $APP_DIR"

# 1. Environment Verification
if [ ! -f ".env" ]; then
    echo "[ERROR] Missing .env file. Aborting."
    exit 1
fi

# 2. Cleanup local state
echo "[DEPLOY] Restoring package-lock.json and stashing local changes..."
git restore package-lock.json || true
git stash push -m "pre-deploy-control-plane-$(date +%Y%m%d-%H%M%S)" || true

# 3. Pull Latest Changes
echo "[DEPLOY] Fetching latest from phase-39.2-tenant-management-console..."
git fetch origin
git checkout phase-39.2-tenant-management-console
git pull origin phase-39.2-tenant-management-console

# 4. Install Dependencies
echo "[DEPLOY] Installing dependencies (including dev for build)..."
npm install --include=dev

# 5. Recreate shared-infra symlink
echo "[DEPLOY] Recreating shared-infra symlink..."
mkdir -p node_modules/@ppos
rm -rf node_modules/@ppos/shared-infra
ln -s /opt/printprice-os/ppos-shared-infra node_modules/@ppos/shared-infra

# 6. Production Build
echo "[DEPLOY] Building frontend..."
rm -rf dist
if ! npm run build; then
    echo "[ERROR] Frontend build failed. Aborting."
    exit 1
fi

# 7. Publish Frontend to Plesk
echo "[DEPLOY] Publishing frontend assets to Plesk/httpdocs..."
rsync -av --delete dist/ /var/www/vhosts/printprice.pro/control.printprice.pro/httpdocs/

echo "[DEPLOY] Restoring SPA .htaccess fallback..."
cat > /var/www/vhosts/printprice.pro/control.printprice.pro/httpdocs/.htaccess <<'EOF'
<IfModule mod_passenger.c>
  PassengerEnabled off
</IfModule>

<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  RewriteCond %{REQUEST_URI} !^/api/
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ /index.html [L]
</IfModule>
EOF

echo "[DEPLOY] Reloading web servers..."
systemctl reload nginx || true
systemctl reload apache2 || true

# 8. PM2 Restart Backend
echo "[DEPLOY] Restarting PM2 process..."
# Export explicit port mapping for the production environment
export PORT=8081
export PPOS_CONTROL_PORT=8081

if command -v pm2 &> /dev/null; then
    pm2 restart ppos-control-plane --update-env
    pm2 save
else
    echo "[WARN] PM2 not found. Please restart the process manually."
fi

# 9. Final Smoke Test
echo "[DEPLOY] Running post-deploy smoke tests..."
sleep 5
if ! node scripts/smoke-control-plane-industrial.js; then
    echo "[CRITICAL] Post-deploy smoke test FAILED."
    echo "[ROLLBACK] Please refer to docs/rollback-phase10-industrial.md"
    exit 1
fi

echo "[DEPLOY] SUCCESS. Control Plane is LIVE."
echo "[DEPLOY] Log: $LOG_FILE"
