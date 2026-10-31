# Production Hardening Checklist — PrintPrice OS Control Plane

## Before Every Production Deployment

### Environment
- [ ] `NODE_ENV=production` is set
- [ ] `JWT_SECRET` is a strong random string (≥ 32 chars)
- [ ] `PPOS_CONTROL_TOKEN` is a strong unique token
- [ ] `PPOS_WORKER_CONTROL_TOKEN` is configured
- [ ] `ENABLE_BREAK_GLASS_TOKEN` is **NOT** set to `true`
- [ ] `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` are all set
- [ ] `.env` file is **NOT** committed to version control

### Build
- [ ] `npm ci` completes without errors
- [ ] `npm run build` completes without errors
- [ ] Bundle chunks are within reasonable limits (< 600kB each)
- [ ] `logs/` directory exists with write permissions

### Database
- [ ] MySQL is running and reachable
- [ ] Database user has appropriate privileges
- [ ] `node scripts/verify-industrial-schema.js` → ALL PASS

### Security
- [ ] Admin routes require valid Bearer token
- [ ] No sensitive data in telemetry/logs
- [ ] Health endpoint (`/health`) is public and returns 200
- [ ] All other `/api/*` routes require authentication

### Pre-flight
- [ ] `node scripts/preflight-production-check.js` → PRODUCTION READINESS: GO

### Validation
- [ ] `node scripts/validate-control-plane-full.js` → SYSTEM STATUS: PRODUCTION READY
- [ ] All 11 phases (12–22) report PASS

### PM2
- [ ] `ecosystem.config.js` is configured with correct `cwd` and `env`
- [ ] `pm2 start ecosystem.config.js` starts without errors
- [ ] `pm2 status` shows `ppos-control-plane` as `online`
- [ ] `pm2 logs ppos-control-plane` shows no fatal errors within 30s of start

---

## Monitoring Post-Deployment

- [ ] `/health` returns `{"status":"ok"}` within 10s of startup
- [ ] `/api/admin/telemetry/snapshot` returns 200 with valid data
- [ ] No ERROR-level events in `logs/control-plane-error.log` in first 5 minutes
- [ ] Memory usage stable (not growing) after 10 minutes

---

## Rollback Procedure

If a deployment fails:

```bash
# Stop the failing process
pm2 stop ppos-control-plane

# Revert to previous commit
git checkout HEAD~1

# Rebuild
npm run build

# Restart
pm2 start ecosystem.config.js

# Verify
node scripts/preflight-production-check.js
```

---

## Regular Maintenance

### Weekly
- [ ] Review `logs/control-plane-error.log` for recurring patterns
- [ ] Run `node scripts/validate-control-plane-full.js --quick`
- [ ] Check memory usage trend in PM2

### Monthly
- [ ] Run full `node scripts/validate-control-plane-full.js`
- [ ] Run `node scripts/verify-industrial-schema.js`
- [ ] Rotate `PPOS_CONTROL_TOKEN` and `JWT_SECRET`
- [ ] Review and archive old log files
