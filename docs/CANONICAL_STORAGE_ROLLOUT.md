# CANONICAL_STORAGE_ROLLOUT

**Target Path**: `PPOS_UPLOADS_DIR=/opt/printprice-os/temp-staging`
**Status**: 🚀 SAFE / STAGED

Migration to a canonical mount point is essential for worker-service synchronization.

## 🛠️ Implementation Strategy (Safe Fallback)
The code in `routes/preflight.js` and `QueueManager.js` now uses:
- `process.env.PPOS_UPLOADS_DIR` (Highest priority)
- `path.join(__dirname, '../temp-staging')` (Safe local fallback)

## 📋 Server-Side Requirements (Mandatory before Activation)
Before setting the environment variable in production, execute:
1. `mkdir -p /opt/printprice-os/temp-staging`
2. `chown -R <user>:<group> /opt/printprice-os/temp-staging` (Match the PM2 user)
3. Ensure the mount has **at least 5GB** of free space.

## 📡 Propagation Logic
- **Service**: Saves files (Multipart) and generates paths based on `PPOS_UPLOADS_DIR`.
- **Worker**: Receives the full `filePath` in the job payload. 
- **Compatibility**: If the env var is not set, current relative paths relative to the worker's CWD are still used, preserving existing behavior until the new path is provisioned.

---

## ✅ Deployment Verdict
**SAFE TO DEPLOY**. The code adapts dynamically to the presence of the environment variable. No hardcoded absolute paths are used that would break a local dev environment.
