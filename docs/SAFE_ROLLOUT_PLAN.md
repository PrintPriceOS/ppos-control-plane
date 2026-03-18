# SAFE_ROLLOUT_PLAN

**Version**: 1.11.0 (Runtime Hardening)
**Objective**: Stabilize the PrintPrice OS production runtime without breaking existing validated flows.

---

## 🟢 PHASE 1: Safe Polish (Immediate Deployment)
**Scope**: UI, Logs, Retries, Validation Script.
**Condition**: No behavioral flow changes.

1.  **Repo: ppos-control-plane**
    - Deploy: `i18n.tsx`, `en.ts`/`es.ts`, updated `AdminDashboard.tsx`.
    - Deploy: `scripts/production-smoke-test.sh`.
2.  **Repo: ppos-preflight-worker**
    - Deploy: `RetryPolicy.js` (Updated to 10 retries, 30s backoff).
    - Deploy: `QueueManager.js` (Updated structured logging metadata).
    - Deploy: `JobRouter.js` (Added logger passing).
3.  **Repo: ppos-preflight-service**
    - Deploy: `WorkerClient.js` (Aligned 10 retries, 30s backoff).

---

## 🟡 PHASE 2: Infrastructure Sync (Requires Server Setup)
**Scope**: Process Management, Canonical Paths.
**Condition**: Server directory structure pre-provisioned.

1.  **Action**: **SERVER SIDE**
    - Create: `mkdir -p /opt/printprice-os/temp-staging`.
    - Chown: `chown -R ppos-admin:ppos-admin /opt/printprice-os`.
2.  **Repo: ppos-preflight-service (Partial)**
    - Deploy: `routes/preflight.js` **(UPLOADS_DIR change ONLY)**.
3.  **Deploy: ecosystem.config.js**
    - Update: Adjust `cwd` and `env` per server actual path.
    - Start: `pm2 start ecosystem.config.js`.

---

## 🔴 PHASE 3: Flow Conversion (Requires Compatibility Review)
**Scope**: Async-by-default Autofix.
**Condition**: Product App (Mobile/Web) must handle `jobId` instead of a PDF buffer.

1.  **Action**: Confirm if the main product app (Product.App) consumes the `/autofix` stream synchronously.
2.  **If SYNC is required**: Revert `routes/preflight.js` multipart logic to original synchronous engine call.
3.  **If ASYNC is accepted**: Deploy fully hardened `routes/preflight.js`.

---

## 🔙 4. Rollback Readiness
Trigger: 500 error on file upload / Job failure in worker log.
1.  Revert `ppos-preflight-service/routes/preflight.js` to commit before v1.11 hardening.
2.  `pm2 reload ppos-preflight-service`.
