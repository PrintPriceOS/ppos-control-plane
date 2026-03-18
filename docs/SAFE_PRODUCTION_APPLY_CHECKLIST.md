# SAFE_PRODUCTION_APPLY_CHECKLIST

**Status**: 📋 READY FOR EXECUTION
**Date**: 2026-03-18
**Target Environment**: PrintPrice OS Production

Follow these steps exactly to rollout v1.11.1 safely.

## 📦 1. Code Preparation
1.  **Repo: ppos-control-plane**
    - `git pull origin main`
    - `npm install`
    - Verify `dist/` is updated if needed.
2.  **Repo: ppos-preflight-worker**
    - `git pull origin main`
    - `npm install`
    - `npm link ../ppos-preflight-engine` (Ensure engine is synced).
3.  **Repo: ppos-preflight-service**
    - `git pull origin main`
    - `npm install`
    - `npm link ../ppos-preflight-engine`.

## 🏗️ 2. Infrastructure
1.  **Directory setup**: `mkdir -p /opt/printprice-os/temp-staging`.
2.  **Permissions**: Ensure the deployment user has read/write access to the above path.
3.  **Environment Variables**:
    - Update the production `.env` with `PPOS_UPLOADS_DIR=/opt/printprice-os/temp-staging`.

## 🚀 3. Startup Sequence
1.  **Register PM2 Configuration**:
    ```bash
    cd ppos-control-plane
    pm2 start ecosystem.config.js --env production
    ```
2.  **Validation Check**:
    - `curl http://localhost:8001/health` (Service)
    - `curl http://localhost:8002/health` (Worker)
    - Check Control Plane dashboard for `WorkerRegistry: ACTIVE`.

## 📡 4. Smoke Test
1.  Execute the script:
    `./scripts/production-smoke-test.sh`
2.  **Result Expected**: "✅ SUCCESS: Job processed correctly!".

## 🏁 5. Final Manual Acceptance
- Open the dashboard (control.printprice.pro).
- Confirm the language selector works (EN/ES).
- Confirm the new Job List shows real start/end timestamps and IDs.
