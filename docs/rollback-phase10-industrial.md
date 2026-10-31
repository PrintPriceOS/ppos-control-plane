# Rollback Plan — Phase 10 Industrial Operations

This document provides emergency procedures to revert the Control Plane to a known stable state if the Phase 10 deployment fails or causes critical regressions.

## 1. Immediate Rollback (Code)

If the build is broken or the UI is crashing:

```bash
# 1. Revert to previous stable commit/branch
git checkout main
git pull origin main

# 2. Re-install dependencies and rebuild
npm ci
npm run build

# 3. Restart process
pm2 restart ppos-control-plane
# OR for Passenger:
touch tmp/restart.txt
```

## 2. Artifact Rollback (Emergency)

If `git` is unavailable or slow, restore the backup created by the deployment script:

```bash
# 1. Identify latest backup
ls -t backups/dist_backup_*.tar.gz | head -1

# 2. Extract over current dist
tar -xzf backups/dist_backup_YYYYMMDD_HHMMSS.tar.gz -C .

# 3. Restart process
pm2 restart ppos-control-plane
```

## 3. Database Rollback

Phase 10 migrations are **additive** (new tables). A rollback of the DB schema is usually NOT required unless a table conflict exists. 

If absolutely necessary to drop the industrial tables:

> [!CAUTION]
> This will PERMANENTLY DELETE all artifact records, worker registries, and incident logs.

```sql
DROP TABLE IF EXISTS preflight_artifacts;
DROP TABLE IF EXISTS worker_nodes;
DROP TABLE IF EXISTS operational_incidents;
DROP TABLE IF EXISTS lifecycle_policies;
```

## 4. Verification Post-Rollback

1. Check `/health` endpoint: `curl https://control.printprice.pro/health`
2. Verify Dashboard loads.
3. Check logs for persistence errors: `pm2 logs ppos-control-plane`
