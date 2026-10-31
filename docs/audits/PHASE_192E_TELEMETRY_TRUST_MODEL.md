# Phase 192E: Telemetry Trust Model

## 1. Authentication vs Authorization Separation
- **Device Authentication**: Validates API key hash on `printer_nodes`. Allows benign telemetry reporting (capacity & health).
- **Authoritative Telemetry Authorization**: Required for active production job status updates (`updateJobStatus`). Requires `PRODUCTION_DISPATCH_ALLOWED = true` and job-to-tenant binding.

## 2. Job Binding Enforcement
Attempts to update foreign or unassigned production jobs are rejected with `TELEMETRY_JOB_NOT_ASSIGNED`.
