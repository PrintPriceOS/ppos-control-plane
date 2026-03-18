# PM2_ROLLBACK_PLAN.md

Quickly revert to the previous `nohup` state if PM2 migration fails.

## 1. Stop PM2

Explicitly stop and delete the PM2 processes to avoid port conflicts.

```bash
# 1. Stop and remove existing PM2 apps
pm2 delete ecosystem.config.js
```

## 2. Restore NOHUP Execution

Manually restart the services using the original `nohup` methods from their respective directories.

```bash
# 2. Service (8001)
cd /opt/printprice-os/ppos-preflight-service
nohup node server.js > service.log 2>&1 &

# 3. Worker (8002)
cd /opt/printprice-os/ppos-preflight-worker
nohup node worker.js > worker.log 2>&1 &
```

## 3. Restore Previous State Verification

Ensure the original `service.log` and `worker.log` are active:

```bash
# 4. Tail the logs for activity
tail -f /opt/printprice-os/ppos-preflight-service/service.log
tail -f /opt/printprice-os/ppos-preflight-worker/worker.log
```

Verify that the systems are again running:

```bash
# 5. Check currently running node processes
ps aux | grep node
# Expect: Current `node server.js` and `node worker.js` processes without PM2 control.
```

## 4. Stability Check

Verify functionality after the rollback.

- **Check API connectivity** (8001)
- **Check Worker Health** (8002)
- **Trigger test job (Sync/Async)**
- **Check worker log activity**
