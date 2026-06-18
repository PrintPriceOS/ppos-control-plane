# Phase 122.2 — Runtime Restart Recovery Manual Drill

## Purpose

This document provides step-by-step instructions for manually verifying that the Internal Order Lifecycle Pilot (Phase 122 / 122.1) survives a production process restart. No code in this system executes a real restart. All restart actions are manual.

## Prerequisites

- Phase 122.1 validated and deployed
- Migration 065 and 066 applied
- PM2 process running
- DB connection active
- Admin API key available

## Manual Drill Steps

### 1. Create a Pilot Run

```bash
curl -X POST http://localhost:8080/api/admin/production/internal-order-lifecycle-pilot/create-run \
  -H "Content-Type: application/json" \
  -H "X-Admin-Api-Key: <YOUR_KEY>" \
  -d '{"tenant_id": "test-tenant-drill", "requested_by": "drill-operator"}'
```

Note the `pilot_run_id` from the response.

### 2. Create a Pilot Order

```bash
curl -X POST http://localhost:8080/api/admin/production/internal-order-lifecycle-pilot/create-order \
  -H "Content-Type: application/json" \
  -H "X-Admin-Api-Key: <YOUR_KEY>" \
  -d '{"pilot_run_id": "<PILOT_RUN_ID>", "tenant_id": "test-tenant-drill"}'
```

### 3. Verify DB Persistence

```bash
curl http://localhost:8080/api/admin/production/internal-order-lifecycle-pilot/readiness?pilot_run_id=<PILOT_RUN_ID> \
  -H "X-Admin-Api-Key: <YOUR_KEY>"
```

Confirm `persistenceMode: "DB"` and `persistenceStatus: "PERSISTED"`.

### 4. Restart PM2 Manually

```bash
pm2 restart ppos-control-plane
```

**Important:** This is a manual action. No code in this system performs this restart.

### 5. Reload UI and Confirm Data

After restart, open the admin UI and navigate to:
- `/admin/production/internal-order-lifecycle-pilot`
- Enter the `pilot_run_id` and click "Evaluate Readiness"
- Confirm the pilot run and order data still appear

### 6. Verify Audit Timeline Recovery

```bash
curl http://localhost:8080/api/admin/production/internal-order-lifecycle-pilot/audit-timeline?pilot_run_id=<PILOT_RUN_ID> \
  -H "X-Admin-Api-Key: <YOUR_KEY>"
```

Confirm audit events created before restart still appear.

### 7. Verify Evidence Pack Recovery

```bash
curl "http://localhost:8080/api/admin/production/internal-order-lifecycle-pilot/evidence-pack?pilot_run_id=<PILOT_RUN_ID>" \
  -H "X-Admin-Api-Key: <YOUR_KEY>"
```

Confirm evidence pack can be rebuilt from DB data after restart.

### 8. Run Runtime Verification Checks

Use the Phase 122.2 Runtime Verification admin UI at:
- `/admin/production/internal-order-lifecycle-runtime-verification`

Or via API:

```bash
# Create verification run
curl -X POST http://localhost:8080/api/admin/production/internal-order-lifecycle-runtime-verification/create \
  -H "Content-Type: application/json" \
  -H "X-Admin-Api-Key: <YOUR_KEY>" \
  -d '{"tenant_id": "test-tenant-drill", "linked_pilot_run_id": "<PILOT_RUN_ID>", "requested_by": "drill-operator"}'

# Run all verification checks
curl -X POST http://localhost:8080/api/admin/production/internal-order-lifecycle-runtime-verification/verify-db-read-through \
  -H "Content-Type: application/json" -H "X-Admin-Api-Key: <YOUR_KEY>" \
  -d '{"verification_run_id": "<VERIFICATION_RUN_ID>"}'

curl -X POST http://localhost:8080/api/admin/production/internal-order-lifecycle-runtime-verification/verify-memory-empty-recovery \
  -H "Content-Type: application/json" -H "X-Admin-Api-Key: <YOUR_KEY>" \
  -d '{"verification_run_id": "<VERIFICATION_RUN_ID>"}'

curl -X POST http://localhost:8080/api/admin/production/internal-order-lifecycle-runtime-verification/verify-audit-recovery \
  -H "Content-Type: application/json" -H "X-Admin-Api-Key: <YOUR_KEY>" \
  -d '{"verification_run_id": "<VERIFICATION_RUN_ID>"}'

curl -X POST http://localhost:8080/api/admin/production/internal-order-lifecycle-runtime-verification/verify-evidence-recovery \
  -H "Content-Type: application/json" -H "X-Admin-Api-Key: <YOUR_KEY>" \
  -d '{"verification_run_id": "<VERIFICATION_RUN_ID>"}'

curl -X POST http://localhost:8080/api/admin/production/internal-order-lifecycle-runtime-verification/verify-allowlist \
  -H "Content-Type: application/json" -H "X-Admin-Api-Key: <YOUR_KEY>" \
  -d '{"verification_run_id": "<VERIFICATION_RUN_ID>"}'

curl -X POST http://localhost:8080/api/admin/production/internal-order-lifecycle-runtime-verification/verify-blockers \
  -H "Content-Type: application/json" -H "X-Admin-Api-Key: <YOUR_KEY>" \
  -d '{"verification_run_id": "<VERIFICATION_RUN_ID>"}'

# Build evidence pack
curl "http://localhost:8080/api/admin/production/internal-order-lifecycle-runtime-verification/evidence-pack?verification_run_id=<VERIFICATION_RUN_ID>" \
  -H "X-Admin-Api-Key: <YOUR_KEY>"
```

### 9. If Verification Fails

If any verification check fails:

1. **Suspend the pilot:** Do not proceed to Phase 123.
2. **Investigate:** Check DB connectivity, migration status, and service logs.
3. **Re-run verification:** After fixing the issue, create a new verification run and repeat.
4. **Rollback if needed:** Use Phase 122 rollback simulation to verify rollback readiness.

## Safety Reminders

- No code in this system executes `pm2 restart` or any process restart command.
- All restart actions are manual and documented.
- FULL_PUBLIC remains NOT_ENABLED.
- No payment, refund, payout, or external submission is executed.
- Memory-only state is NOT considered production-valid.
