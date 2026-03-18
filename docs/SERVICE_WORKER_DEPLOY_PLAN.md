# SERVICE_WORKER_DEPLOY_PLAN

**Status**: 🚀 PLANNED
**Target Date**: 2026-03-18
**Ecosystem**: PrintPrice OS v1.9.4

## 📦 Deployment Sequence (Phased Activation)

### 1. Pre-Deploy Preparation (Infra)
- **Shared Storage**: Ensure `/var/www/vhosts/printprice.pro/temp-staging` exists and is accessible by the worker's user.
- **Environment Context**: Correctly set `REDIS_HOST`, `REDIS_PASSWORD`, and `ADMIN_API_KEY` on the target nodes.

### 2. PHASE A: Preflight Worker (Execution Layer)
**Goal**: Sub-system is ready to consume before the service is ready to produce.
- **Action**: Pull `ppos-preflight-worker` (main) on worker nodes.
- **Command**: `npm install && npm start`.
- **Validation**: Check `curl localhost:8002/health`. Expected: `{"status": "UP"}`.

### 3. PHASE B: Preflight Service (Orchestration Layer)
**Goal**: Connect to the already-running worker system.
- **Action**: Pull `ppos-preflight-service` (main) on service nodes.
- **Command**: `npm install && npm start`.
- **Validation**: Check `curl localhost:8001/health`. Expected: `{"status": "OK"}`.

### 4. PHASE C: Control Plane (Verification Layer)
**Goal**: Confirm overall ecosystem visibility.
- **Action**: Access `control.printprice.pro`.
- **Check**: Navigate to **System Status** and confirm:
  - Worker count > 0 in Node Registry.
  - Queue `preflight_async_queue` is visible.

---

## 🛠️ Restart Order (Dependency Chain)
1. **Redis** (If restart needed, start first).
2. **Worker** (Must exist and heartbeat before any processing).
3. **Service** (Final orchestrator).

---

## 🚧 Rollback Strategy
**Trigger**: Worker health returns 5xx or Control Plane shows 0 workers for > 2 mins.
1. **Immediate Action**: Stop `ppos-preflight-service` to prevent new jobs from enqueuing.
2. **Revert**: `git checkout v1.8.x` on the worker if the new heartbeat is failing.
3. **Redeploy**: Restart service only after worker stabilizes.
