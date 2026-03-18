# PM2_VALIDATION_CHECKLIST.md

Post-Migration Validation for PrintPrice OS.

## 1. Local Health Verification

Verify that the Service and Worker are UP and responding correctly.

- **Service (8001)**:
  `curl -s http://127.0.0.1:8001/health`
  Expected Output: `{"status":"ok"}` or `{"status":"UP"}`

- **Worker (8002)**:
  `curl -s http://127.0.0.1:8002/health`
  Expected Output: `{"status":"UP","service":"ppos-preflight-worker"}`

## 2. Control Plane Visibility

Verify endpoints used by the Control Plane (Plesk-managed).

- **Workers Status**:
  `curl -s https://control.printprice.pro/api/system/workers`
  Verify that `ppos-preflight-worker` appears in the list as `active`.

- **Queue Status**:
  `curl -s https://control.printprice.pro/api/system/queues`
  Verify that `preflight_async_queue` is active and reachable.

## 3. Synchronous Flow (Small PDF)

- **Analyze (Sync)**:
  `curl -X POST http://127.0.0.1:8001/preflight/analyze \
    -H "x-ppos-api-key: <ADMIN_API_KEY>" \
    -F "file=@test-small-under-5mb.pdf"`
  
  Expected: JSON result containing analysis data immediately.

## 4. Asynchronous Flow (Large PDF)

- **Analyze (Async)**:
  `curl -X POST http://127.0.0.1:8001/preflight/analyze \
    -H "x-ppos-api-key: <ADMIN_API_KEY>" \
    -F "file=@test-large-over-5mb.pdf"`
  
  Expected:
  - `{"ok": true, "job_id": "...", "status": "PENDING"}` (HTTP 202)

- **Job Processing Check**:
  `pm2 logs ppos-preflight-worker --lines 20`
  Verify that the worker shows `Processing job <job_id>` and `Job <job_id> completed`.

- **Admin Job Status**:
  `curl -s https://control.printprice.pro/api/admin/jobs/<job_id>`
  Expected: `status: COMPLETED`

## 5. Persistence Check

- **PM2 Startup Status**:
  `systemctl status pm2-<user>`
  Expected: `Active: active (running)`

- **Reboot Survival Verification (Planned)**:
  `sudo reboot`
  After reboot, `pm2 list` should show both apps in `online` status.
