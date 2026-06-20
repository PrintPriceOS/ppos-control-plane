# Phase 128.1 — Invite-Only Limited Beta Runtime Restart Recovery Drill

## Goal & Description
Document and validate that the Limited Beta Runtime state (sessions, kill switches, scope policies, grants, activity logs, etc.) is fully restart-safe, DB-backed, and operationally recoverable across service restarts.

## Operational Recovery Runbook

```bash
cd /opt/printprice-os/ppos-control-plane

node -r dotenv/config scripts/run-migrations-manual.js

node -r dotenv/config scripts/smoke_phase128_1a_runtime_restart_schema.js
node scripts/smoke_phase128_1_1_real_db_restart_schema_required.js

node scripts/smoke_phase128_1h_real_pm2_restart_drill_marker.js --before
# copy DRILL_MARKER_ID

pm2 restart ppos-control-plane

node scripts/smoke_phase128_1h_real_pm2_restart_drill_marker.js --after --marker-id=<DRILL_MARKER_ID>

node scripts/smoke_phase128_1_2_pm2_restart_detection_acceptance.js
node scripts/smoke_phase128_1_3_restart_recovery_state_persistence.js
node scripts/smoke_phase128_1g_runtime_restart_acceptance_pack.js

npm run build
```

## Safety Invariants & Governance
- **`FULL_PUBLIC`**: `NOT_ENABLED` (Always false/0)
- **`OPEN_MARKETPLACE`**: `NOT_ENABLED` (Always false/0)
- **`PAYMENT_EXECUTION`**: `NOT_ENABLED` (Always false/0)
- **`PROVIDER_EXTERNAL_SUBMISSION`**: `NOT_ENABLED` (Always false/0)
- **`TAX/ACCOUNTING_EXTERNAL_SUBMISSION`**: `NOT_ENABLED` (Always false/0)

These safety rules persist correctly across restart and are audited inside version `128.1` evidence packs.
