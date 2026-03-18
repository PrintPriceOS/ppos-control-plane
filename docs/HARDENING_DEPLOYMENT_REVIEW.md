# HARDENING_DEPLOYMENT_REVIEW

**Status**: 🔍 UNDER REVIEW
**Date**: 2026-03-18
**Engineers**: Antigravity, Production Rollout Review Unit

## 🧪 1. Hardening Audit & Classification Matrix

| Change Category | Components Affected | Risk Level | Deploy Recommendation |
| :--- | :--- | :--- | :--- |
| **i18n & UX Polish** | Control Plane UI | 🟢 LOW | **SAFE TO DEPLOY NOW** |
| **Structured Logging** | Worker, Service | 🟢 LOW | **SAFE TO DEPLOY NOW** |
| **Retry & Backoff Hardening**| Worker, Service | 🟡 MED | **SAFE TO DEPLOY NOW** |
| **Canonical Path Transition**| Worker, Service | 🔴 HIGH | **SAFE WITH SERVER ADJUSTMENT** |
| **Asynchronous Autofix 전환**| Service Routes | 🟣 CRITICAL| **REQUIRES COMPATIBILITY REVIEW** |
| **Process Supervision** | Infra (Systemd/PM2) | 🟡 MED | **SAFE WITH SERVER ADJUSTMENT** |

---

## ⚠️ 2. Critical Regression Analysis

### 🔴 Case: Asynchronous Autofix (Breaking Change)
**Change**: In `ppos-preflight-service/routes/preflight.js`, the `/autofix` endpoint now enqueues a job and returns a `jobId` even for direct file uploads (multipart).
*   **Risk**: **CRITICAL BACKWARD INCOMPATIBILITY**.
*   **Impact**: If the Product App (caller) expects a **Binary PDF file** in the HTTP response body (synchronous behavior), this change will break the integration immediately. The caller will receive a JSON object `{ ok: true, jobId: "..." }` instead of a PDF.
*   **Compatibility Verdict**: **DO NOT DEPLOY YET** without confirming the Product App's capability to poll for results.

### 🟡 Case: Canonical Path Transition
**Change**: Service and Worker now rely on `PPOS_UPLOADS_DIR` (default: `/opt/printprice-os/temp-staging`).
*   **Risk**: **Deployment Blocker**.
*   **Impact**: If the directory does not exist or has incorrect permissions (POSIX user `ppos-admin`), uploads and worker analysis will fail with `ENOENT`.
*   **Compatibility Verdict**: **SAFE WITH SERVER ADJUSTMENT**. Directory must be manually created first.

---

## 🛠️ 3. Supervision Layer Review (PM2/Systemd)

Audit for Linux/Plesk environments:
- **Paths**: The `cwd` in `ecosystem.config.js` and `WorkingDirectory` in `.service` files assume a specific clone location. These **must** be verified against the actual server path.
- **User Permissions**: `User=ppos-admin` is a placeholder. On Plesk/Generic systems, this should match the system user (e.g., `web1`, `www-data`, etc.).
- **Node Paths**: `ExecStart=/usr/bin/node` might differ if `nvm` or custom node managers are used.

---

## 🏁 4. Blocker Summary

1.  **CONTRACT BREAK**: The forced async behavior of `/autofix` violates the synchronous buffer return expected by standard clients.
2.  **INFRA**: Missing `/opt/printprice-os/temp-staging` mount.
3.  **REFS**: Local linking (`npm link`) must be executed on-server after clone.
