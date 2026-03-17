# WORKER_CONSUMPTION_ALIGNMENT_REPORT

**Status**: 🟡 ALIGNED with HOTFIXES
**Date**: 2026-03-17

During the activation of the end-to-end job flow, several naming and contract mismatches were identified between the Producer (Preflight Service) and the Consumer (Preflight Worker).

## 🔍 Identified Mismatches

### 1. Naming Convention (Camel vs Snake)
- **Producer**: Sends `assetId` and `tenantId`.
- **Consumer (JobRouter.js)**: Was only checking for `asset_id` and `job_id` in the Circuit Breaker guard.
- **Fix**: Updated `JobRouter.js` to support both `assetId`/`asset_id` and `jobId`/`job_id`.

### 2. Missing `filePath` in AUTOFIX
- **Producer**: The `autofix` method in `PreflightService.js` was enqueuing jobs without the mandatory `filePath` required by the `AutofixProcessor.js`.
- **Risk**: The worker would fail with "Could not find file" or similar engine errors.
- **Recommendation**: Ensure the upstream caller (Product App) passes the correctly staged `filePath` in the body, or implement ID-to-Path resolution.

### 3. Queue Synchronization
- Both services are correctly reading from `PPOS_QUEUE_NAME` (default: `preflight_async_queue`).
- Redis connection parameters are consistent across the ecosystem.

## ✅ Verification
The worker's `JobRouter` is now robust enough to handle payloads from different versions of the service layer.
