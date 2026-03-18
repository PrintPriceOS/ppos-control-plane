# SERVICE_WORKER_BLOCKERS

**Status**: 🔴 BLOCKED (Deployment phase)
**Date**: 2026-03-18
**Ecosystem**: PrintPrice OS v1.9.4

## 🛠️ Code Blockers
- **NONE**: The code for `ppos-preflight-service`, `ppos-preflight-worker`, and `ppos-control-plane` has been reconciled and pushed. Contract alignment is 100%.

## 🚀 Deployment Blockers
- **SHARED DRIVE MOUNT**: The worker MUST have access to the same directory the service uses for file storage. Without this, the engine will fail to find the analysis seed.
- **REDIS PASSWORD**: Confirm the same server-wide Redis password is and applied to both `.env` files in the runtime repositories.

## 🏗️ Infrastructure Blockers
- **FIREWALL**: Port 8001 (Service) and 8002 (Worker Health) must be accessible within the internal network for the Control Plane node to probe.
- **DISK SPACE**: Ensure `/temp-staging` has enough quota to handle uploaded PDFs before cleanup. (Recommended: 5GB+).

## 🔑 Auth Blockers
- **ADMIN_API_KEY**: The service and product app MUST share the same `ADMIN_API_KEY`. If they diverge, product requests will return 401.

## 🏁 Summary Verdict
**Service Ready**: YES (Conditional on `ADMIN_API_KEY`).
**Worker Ready**: YES (Conditional on Shared Drive Mount).

---

## 📅 Next Production Action
1. **Provision shared directory** on the production node(s).
2. **Deploy `ppos-preflight-worker`** first.
3. **Verify worker heartbeat** on the control plane.
4. **Deploy `ppos-preflight-service`** second.
5. **Run `enqueue_test_job.js`** to confirm end-to-end flow.
