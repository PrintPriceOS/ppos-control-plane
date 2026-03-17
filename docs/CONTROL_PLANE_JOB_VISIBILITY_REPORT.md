# CONTROL_PLANE_JOB_VISIBILITY_REPORT

**Status**: ✅ ACTIVATED (REAL-TIME STATUSES)
**Date**: 2026-03-17

The Control Plane's job visibility layer is now fully operational with real-time status hydration from BullMQ.

## 📡 Improvements Made

### 1. Status Hydration
The `queueOperator.js` adapter was updated to asynchronously fetch the **true state** of each job (`WAITING`, `ACTIVE`, `COMPLETED`, `FAILED`). Previously, it was returning a placeholder.

### 2. Job Lifecycle Tracking
The dashboard now correctly maps the BullMQ lifecycle:
- **WAITING / DELAYED**: Visible in the "Queue" tab.
- **ACTIVE**: Visible as "Processing".
- **COMPLETED**: Retained for historical view (until TTL).
- **FAILED**: Shows the specific `failedReason` captured by the worker.

### 3. Payload Inspectability
The `data` field of the job is passed to the UI, allowing operators to see the `tenantId`, `filePath`, and `assetId` being processed.

---

## ✅ Visibility Matrix

| Feature | Working? | Source |
| :--- | :--- | :--- |
| **Backlog Count** | Yes | `queue.getJobCounts()` |
| **Real Job List** | Yes | `queue.getJobs()` |
| **Job State** | Yes | `job.getState()` |
| **Error Reasons** | Yes | `job.failedReason` |
| **Progress** | Yes | `job.progress` |
