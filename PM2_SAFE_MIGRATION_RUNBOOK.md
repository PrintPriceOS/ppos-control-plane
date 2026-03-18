# PM2_SAFE_MIGRATION_RUNBOOK.md

Step-by-step for a Zero-Refression migration from NOHUP to PM2.

## 1. Inspect Current State

Verify that the systems are currently running as expected.

```bash
# Verify currently running node processes
ps aux | grep node
```

## 2. Capture PIDs

Locate the PIDs for the Service and Worker.

```bash
# Service
PID_SERVICE=$(pgrep -f "node server.js")
# Worker
PID_WORKER=$(pgrep -f "node worker.js")

echo "Captured Service PID: $PID_SERVICE"
echo "Captured Worker PID: $PID_WORKER"
```

## 3. Graceful Stop

We MUST stop only these two processes and NOT the engine (library) or Redis.

```bash
kill $PID_SERVICE
kill $PID_WORKER
```

Verify shutdown:
```bash
ps aux | grep node # PIDs should not exist.
```

## 4. Launch PM2

Use the `ecosystem.config.js` provided in the repository root.

```bash
# Create log directory
sudo mkdir -p /opt/printprice-os/runtime-logs/
sudo chmod 777 /opt/printprice-os/runtime-logs/

# Start PM2
cd /opt/printprice-os/
pm2 start ecosystem.config.js
```

## 5. Verify Health

Test local health endpoints (Port 8001/8002).

```bash
# Service Health
curl -s http://127.0.0.1:8001/health | jq
# Worker Health
curl -s http://127.0.0.1:8002/health | jq

# Expected Response: {"status": "UP" ...}
```

## 6. Verify Control Plane Visibility

Ensure that the Worker is registered and heartbeat is updated.

- URL: `https://control.printprice.pro/api/system/workers/`
- Check for `ppos-preflight-worker` and current timestamp.

## 7. Run Synchronous Test

Test behavior for small PDFs (< 5MB).

```bash
curl -X POST http://127.0.0.1:8001/preflight/analyze \
  -H "x-ppos-api-key: <ADMIN_API_KEY>" \
  -F "file=@test-small.pdf"
```

Expected: `{"ok": true, "data": { ... }}`

## 8. Run Asynchronous Test

Test behavior for large PDFs (>= 5MB).

```bash
curl -X POST http://127.0.0.1:8001/preflight/analyze \
  -H "x-ppos-api-key: <ADMIN_API_KEY>" \
  -F "file=@test-large.pdf"
```

Expected: `{"ok": true, "job_id": "...", "status": "PENDING"}`

## 9. Final Checklist

- [ ] Control Plane visibility: OK
- [ ] Sync Analyze: OK
- [ ] Async Analyze (Job ID): OK
- [ ] Worker Logs (processing job): OK (`pm2 logs ppos-preflight-worker`)
