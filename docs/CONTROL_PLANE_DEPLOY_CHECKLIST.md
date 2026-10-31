# CONTROL_PLANE_DEPLOY_CHECKLIST

**Target Domain**: `control.printprice.pro` (`212.227.79.67`)
**Canonical Branch**: `main`
**Application Root**: `/opt/printprice-os/ppos-control-plane`
**Frontend Document Root**: `/var/www/vhosts/printprice.pro/control.printprice.pro/httpdocs`
**PM2 Service**: `ppos-control-plane` (Port `8081`)

This checklist defines the canonical git-driven deployment from `origin/main` in production.

## 🚀 Redeploy Steps

1. **Fetch & Synchronize `main`**:
   ```bash
   cd /opt/printprice-os/ppos-control-plane
   git fetch origin
   git checkout main
   git pull --ff-only origin main
   ```
2. **Verify Migration Baseline & Update Dependencies**:
   ```bash
   npm ci
   node -e "const { verifyMigrationBaseline } = require('./src/services/migrationIntegrity.js'); console.log(verifyMigrationBaseline());"
   ```
3. **Build Frontend Bundle & Publish to `httpdocs`**:
   ```bash
   npm run build
   npm prune --omit=dev
   rsync -a --delete dist/ /var/www/vhosts/printprice.pro/control.printprice.pro/httpdocs/
   ```
4. **Environment Check**:
   Confirm `.env` is present in `/opt/printprice-os/ppos-control-plane/.env` and contains `PPOS_CONTROL_TOKEN` and `NODE_ENV=production`.
5. **Zero-Downtime Reload Service**:
   ```bash
   pm2 reload ppos-control-plane --update-env
   pm2 save
   ```

## ✅ Validation (Post-Deploy)

- [ ] `http://127.0.0.1:8081/live` (Returns `200 {"status":"UP"}`)
- [ ] `http://127.0.0.1:8081/ready` (Returns `200 {"status":"READY"}`)
- [ ] `https://control.printprice.pro/` (Returns `200 OK` and serves the latest `dist/index.html` bundle)
- [ ] `https://control.printprice.pro/api/system/health` (Returns connectivity stats)

---

**CRITICAL NOTE**: Always deploy from `origin/main` and never skip `npm run build` + `rsync` to `httpdocs/`.
