#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# PrintPrice OS Control Plane — Safe Deployment Orchestrator
# 
# Enforces:
# - Clean git tree checks (no implicit stashing)
# - Deterministic branch checkout & fetch reset
# - Reproducible npm dependencies via npm ci
# - Integrity Gates: Phase 183 & Phase 184
# - Zero DDL runtime evaluation
# - Dry-run pending migration checks (Policy A: manual opt-in)
# - Atomic frontend dist backups
# - PM2 ecosystem hot-reloads with active /live & /ready polling checks
# - Automatic Git & Build rollback on failure
# -----------------------------------------------------------------------------

set -Eeuo pipefail

BRANCH="${PPOS_DEPLOY_BRANCH:-phase-39.2-tenant-management-console}"
APP_DIR="/opt/printprice-os/ppos-control-plane"
WEB_ROOT="/var/www/vhosts/printprice.pro/control.printprice.pro/httpdocs"
PROCESS_NAME="ppos-control-plane"
LOCAL_URL="http://127.0.0.1:8081"

cd "$APP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="$APP_DIR/deploy_${TIMESTAMP}.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[DEPLOY] Starting Safe Control Plane Deployment..."
echo "[DEPLOY] Target Branch: $BRANCH"
echo "[DEPLOY] APP DIR: $APP_DIR"

PREVIOUS_COMMIT="$(git rev-parse HEAD 2>/dev/null || true)"

# Deployment progress trackers
CODE_CHANGED=0
BACKEND_RESTARTED=0
FRONTEND_PUBLISHED=0

# Rollback handler
rollback() {
  local exit_code=$?
  if [ "$exit_code" -eq 0 ]; then
    return
  fi

  echo "--------------------------------------------------------"
  echo "[CRITICAL] Deployment failed with exit code $exit_code."
  echo "--------------------------------------------------------"

  if [ "${CODE_CHANGED}" -eq 0 ] && [ "${BACKEND_RESTARTED}" -eq 0 ] && [ "${FRONTEND_PUBLISHED}" -eq 0 ]; then
    echo "[ROLLBACK] Failure occurred before any local changes or process restarts. No action needed."
    exit "$exit_code"
  fi

  echo "[ROLLBACK] Initiating recovery process..."

  if [ -n "${PREVIOUS_COMMIT:-}" ] && [ "${CODE_CHANGED}" -eq 1 ]; then
    echo "[ROLLBACK] Restoring repository to previous commit: $PREVIOUS_COMMIT"
    git reset --hard "$PREVIOUS_COMMIT" || true

    echo "[ROLLBACK] Restoring dependency tree..."
    npm ci --include=dev || true

    echo "[ROLLBACK] Rebuilding assets..."
    npm run build || true

    echo "[ROLLBACK] Restoring symlink..."
    mkdir -p node_modules/@ppos
    rm -rf node_modules/@ppos/shared-infra
    ln -s /opt/printprice-os/ppos-shared-infra node_modules/@ppos/shared-infra || true
  fi

  if [ "${BACKEND_RESTARTED}" -eq 1 ]; then
    echo "[ROLLBACK] Re-triggering PM2 with prior state..."
    export PORT=8081
    export PPOS_CONTROL_PORT=8081
    pm2 startOrReload ecosystem.config.js --only "$PROCESS_NAME" --env production --update-env || true
  fi

  echo "[ROLLBACK] Recovery completed. Exiting."
  exit "$exit_code"
}

trap rollback ERR

# 1. Clean tree verification
echo "[DEPLOY] Verifying working tree cleanliness..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[ERROR] Staged or unstaged changes found in working tree. Refusing to deploy."
  git status --short
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "[ERROR] Untracked files found in repository. Refusing to deploy."
  git status --short
  exit 1
fi

if [ ! -f ".env" ]; then
  echo "[ERROR] Missing production configuration (.env file)."
  exit 1
fi

# 2. Fetch and Reset to exact commit
echo "[DEPLOY] Syncing with remote repository..."
git fetch --prune origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
CODE_CHANGED=1

DEPLOY_COMMIT="$(git rev-parse HEAD)"
echo "[DEPLOY] Target Commit: $DEPLOY_COMMIT"

# 3. NPM Clean Install
echo "[DEPLOY] Installing dependencies in locked mode..."
npm ci --include=dev

# 4. Shared infra dependency symlink
echo "[DEPLOY] Recreating shared-infra connection..."
mkdir -p node_modules/@ppos
rm -rf node_modules/@ppos/shared-infra
ln -s /opt/printprice-os/ppos-shared-infra node_modules/@ppos/shared-infra

# 5. Integrity gates
echo "[DEPLOY] Running Phase 183 Checksum Validation..."
npm run migration:integrity

echo "[DEPLOY] Running Phase 184 DDL Isolation Checks..."
node scripts/smoke_phase184_runtime_ddl_isolation.js

# 6. Database schema check (Policy A)
echo "[DEPLOY] Verifying database migration status..."
# Run dry-run migration to inspect if any schemas need mutation.
# The dry-run returns 0 and outputs pending logs.
npm run db:migrate -- --dry-run

# 7. Build Frontend
echo "[DEPLOY] Building frontend distribution..."
rm -rf dist
npm run build

# 8. Archive current live frontend
echo "[DEPLOY] Archiving active frontend build..."
BACKUP_DIR="/opt/printprice-os/deployment-backups/ppos-control-plane"
mkdir -p "$BACKUP_DIR"
if [ -d "$WEB_ROOT" ] && [ -n "$(ls -A "$WEB_ROOT" 2>/dev/null)" ]; then
  tar -czf \
    "$BACKUP_DIR/httpdocs_${PREVIOUS_COMMIT}_${TIMESTAMP}.tar.gz" \
    -C "$WEB_ROOT" .
fi

# 9. PM2 start / update-env
echo "[DEPLOY] Deploying backend process..."
export PORT=8081
export PPOS_CONTROL_PORT=8081

pm2 startOrReload ecosystem.config.js --only "$PROCESS_NAME" --env production --update-env
BACKEND_RESTARTED=1

# 10. Polling active readiness
echo "[DEPLOY] Verifying service health..."
LIVE=0
for attempt in $(seq 1 30); do
  if curl --fail --silent "$LOCAL_URL/live" >/dev/null; then
    LIVE=1
    break
  fi
  sleep 2
done

if [ "$LIVE" -ne 1 ]; then
  echo "[ERROR] Service /live check failed."
  pm2 logs "$PROCESS_NAME" --lines 100 --nostream || true
  exit 1
fi

READY=0
for attempt in $(seq 1 30); do
  if curl --fail --silent "$LOCAL_URL/ready" >/dev/null; then
    READY=1
    break
  fi
  sleep 2
done

if [ "$READY" -ne 1 ]; then
  echo "[ERROR] Service /ready check failed (possible schema mismatch or backend error)."
  curl --silent "$LOCAL_URL/ready" || true
  pm2 logs "$PROCESS_NAME" --lines 100 --nostream || true
  exit 1
fi

# 11. Publish Frontend Assets
echo "[DEPLOY] Publishing compiled frontend to web root..."
rsync -a --delete dist/ "$WEB_ROOT/"
FRONTEND_PUBLISHED=1

cat > "$WEB_ROOT/.htaccess" <<'EOF'
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

echo "[DEPLOY] Reloading HTTP servers..."
systemctl reload nginx || true
systemctl reload apache2 || true

# 12. Run safe smoke validation
echo "[DEPLOY] Validating operational smoke tests..."
: "${PPOS_CONTROL_TOKEN:?[ERROR] PPOS_CONTROL_TOKEN environment variable is not defined}"

PPOS_CONTROL_URL="$LOCAL_URL" \
node scripts/smoke-control-plane-industrial.js

# Save PM2 state only on successful validation
echo "[DEPLOY] Saving PM2 state..."
pm2 save

echo "--------------------------------------------------------"
echo "[DEPLOY] SUCCESS. Deployment completed."
echo "[DEPLOY] Previous commit: $PREVIOUS_COMMIT"
echo "[DEPLOY] Deployed commit: $DEPLOY_COMMIT"
echo "[DEPLOY] Log: $LOG_FILE"
echo "--------------------------------------------------------"
