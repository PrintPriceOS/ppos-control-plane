# JOB_TRACEABILITY_REPORT

**Status**: ✅ ACTIVATED (TIME-BASED TRACKING)
**Date**: 2026-03-17

Minimal job execution traceability has been implemented by unlocking BullMQ's native internal timestamps.

## 📡 Trace Visibility Features

### 1. Job Life Cycle Timestamps
The `queueOperator.js` adapter now extracts:
- **`created_at`** (`timestamp`): When the job was submitted by the producer.
- **`processed_at`** (`processedOn`): When a worker node picked up the job from the queue.
- **`finished_at`** (`finishedOn`): When the job result was returned (Success or Failure).

### 2. Execution Metrics
- **Duration**: Automatically calculated for completed/failed jobs (`finishedOn` - `processedOn`).
- **Wait Time**: Can be inferred from `processed_at` - `created_at`.
- **Attempts**: Tracks `attemptsMade` to identify flaky or problematic jobs.

### 3. Error Diagnostics
- **`error`**: Surfaces `failedReason` clearly for operators.

---

## ✅ Traceability Matrix

| Field | Source | Meaning |
| :--- | :--- | :--- |
| `created_at` | BullMQ: `timestamp` | Enqueue Time |
| `processed_at` | BullMQ: `processedOn` | Start Time |
| `finished_at`| BullMQ: `finishedOn` | Finish Time |
| `duration_ms` | Calculated | Execution Time |
| `attempts` | BullMQ: `attemptsMade` | Retry Count |
| `error` | BullMQ: `failedReason` | Root Cause |
