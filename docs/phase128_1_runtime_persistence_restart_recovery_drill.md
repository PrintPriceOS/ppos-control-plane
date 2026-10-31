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

pm2 restart ppos-control-plane

node scripts/smoke_phase128_1h_real_pm2_restart_drill_marker.js --after

node scripts/smoke_phase128_1h_real_pm2_restart_drill_marker.js --verify-completed
node scripts/smoke_phase128_1_2_pm2_restart_detection_acceptance.js
node scripts/smoke_phase128_1_3_restart_recovery_state_persistence.js
node scripts/smoke_phase128_1_4_restart_acceptance_aggregator_finalization.js
node scripts/smoke_phase128_1g_runtime_restart_acceptance_pack.js

node scripts/smoke_phase128_1c_runtime_after_restart_recovery.js
node scripts/smoke_phase128_1d_runtime_kill_switch_restart_survival.js
node scripts/smoke_phase128_1e_runtime_admin_api_ui_restart_drill.js
node scripts/smoke_phase128_1f_runtime_restart_evidence_pack.js

node -r dotenv/config scripts/smoke_phase128a_limited_beta_runtime_schema.js
node scripts/smoke_phase128g_limited_beta_runtime_acceptance_pack.js
node -r dotenv/config scripts/smoke_phase127_1a_limited_beta_persistence_schema.js
node scripts/smoke_phase127_1f_limited_beta_persistence_acceptance_pack.js

npm run build
```

## Safety Invariants & Governance
- **`FULL_PUBLIC`**: `NOT_ENABLED` (Always false/0)
- **`OPEN_MARKETPLACE`**: `NOT_ENABLED` (Always false/0)
- **`PAYMENT_EXECUTION`**: `NOT_ENABLED` (Always false/0)
- **`PROVIDER_EXTERNAL_SUBMISSION`**: `NOT_ENABLED` (Always false/0)
- **`TAX/ACCOUNTING_EXTERNAL_SUBMISSION`**: `NOT_ENABLED` (Always false/0)

These safety rules persist correctly across restart and are audited inside version `128.1` evidence packs.
