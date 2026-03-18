# POST_DEPLOY_VALIDATION_CHECKLIST

**Status**: 📋 READY
**Date**: 2026-03-18
**Ecosystem**: PrintPrice OS v1.9.4

## 📡 Control Plane Smoke-Check (Pre-Activation)

- [ ] **System Health**: Navigate to `/api/system/health`. Expected: `{"dependencies": {"redis": {"status": "ready"}}}`.
- [ ] **Queue Stats**: Navigate to `/api/system/queues`. Expected: `size: 0, status: 'RUNNING'`.
- [ ] **Worker Registry**: Navigate to `/api/system/workers`. Expected: `count: >= 1`.
  - [ ] **Discovery Mode**: Must be `CANONICAL_REGISTRY`.
  - [ ] **Metadata**: Confirm `hostname` and `id` are present.

---

## 🚀 True Work Verification (The "Acid Test")

### 1. Enqueue Test Job
**Action**: Run the activation script on the Control Plane node:
```bash
cd ppos-control-plane
node scripts/enqueue_test_job.js
```

### 2. Monitor Worker Logs
**Action**: Check `ppos-preflight-worker` STDOUT for the following:
- [ ] `Job started { jobId: '...', workerId: '...' }`
- [ ] `[PROCESSOR][ANALYZE] Running engine...`
- [ ] `Job completed successfully { jobId: '...' }`

### 3. Verify Control Plane UI
**Action**: Refresh the "Jobs" tab in the dashboard:
- [ ] **Wait to Active**: Confirm the job status changes to `ACTIVE` (in real-time).
- [ ] **Success**: Confirm the job status reaches `COMPLETED`.
- [ ] **Traceability**: Confirm `processed_at` and `duration_ms` are visible for the new job.

---

## 🏁 Verification Verdict
**Success**: Sub-system is only verified after a test job moves from **Service/Script → Redis → Worker → Finished → Dashboard Visibility**.
