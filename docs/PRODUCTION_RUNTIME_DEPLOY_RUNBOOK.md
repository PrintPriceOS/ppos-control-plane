# PRODUCTION_RUNTIME_DEPLOY_RUNBOOK

**Status**: 🟢 PRODUCTION GRADE
**System**: PrintPrice OS Runtime v1.11.0
**Target OS**: Linux (Ubuntu/Debian)

---

## 🏗️ 1. Directory Structure

Canonical deployment root: `/opt/printprice-os`

```bash
/opt/printprice-os/
  ├── ppos-preflight-service/    # Orchestrator
  ├── ppos-preflight-worker/     # Execution Node
  ├── ppos-preflight-engine/     # Core Logic (Internal)
  ├── ppos-shared-infra/         # Shared Logic
  └── temp-staging/              # SHARED DISK STORAGE (MANDATORY)
```

## 🔑 2. Environment Variables Matrix

| Variable | Target | Recommended |
| :--- | :--- | :--- |
| `NODE_ENV` | ALL | `production` |
| `REDIS_HOST` | ALL | `127.0.0.1` (or managed) |
| `REDIS_PASSWORD` | ALL | `****` |
| `PPOS_UPLOADS_DIR` | ALL | `/opt/printprice-os/temp-staging` |
| `ADMIN_API_KEY` | SERVICE | Secure random string |
| `PPOS_SERVICE_PORT` | SERVICE | `8001` |
| `HEALTH_PORT` | WORKER | `8002` |

## 🚀 3. Startup & Installation

### A. Dependency Integrity
NPM linking ensures local packages are used without stale references:

```bash
cd /opt/printprice-os/ppos-preflight-service
npm install
npm link ../ppos-preflight-engine

cd /opt/printprice-os/ppos-preflight-worker
npm install
npm link ../ppos-preflight-engine
npm link ../ppos-shared-infra
```

### B. Startup Sequence
1.  **Redis Server**: Ensure it's active.
2.  **Worker**: Starts first to be ready for intake (`pm2 start ecosystem.config.js --only ppos-preflight-worker`).
3.  **Service**: Starts last (`pm2 start ecosystem.config.js --only ppos-preflight-service`).

## 📡 4. Health & Validation

### Health Checks
- **Service**: `curl http://localhost:8001/health`
- **Worker**: `curl http://localhost:8002/health`
- **Control Plane**: Verify "Active Workers" count > 0.

### Post-Deploy Smoke Test
Run the standardized validation script from the control plane node:
`./scripts/production-smoke-test.sh`

## 🚧 5. Failure & Recovery

### Symptom: Workers show "INACTIVE" in Control Plane
1.  Check Redis connectivity.
2.  Restart worker: `pm2 restart ppos-preflight-worker`.
3.  Check worker logs: `pm2 logs ppos-preflight-worker`.

### Symptom: API returns 401
1.  Verify `X-PPOS-API-KEY` matches between Client and Service.
2.  Check service environment variables.

---

## 🔙 6. Rollback Procedure
1.  Switch to previous stable tag: `git checkout v1.10.x`.
2.  Rebuild: `npm install`.
3.  Restart: `pm2 restart all`.
