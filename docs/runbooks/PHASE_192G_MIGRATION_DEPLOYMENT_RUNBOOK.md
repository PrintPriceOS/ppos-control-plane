# docs/runbooks/PHASE_192G_MIGRATION_DEPLOYMENT_RUNBOOK.md

## Phase 192G — Migration Deployment Runbook

### Version: 1.0 — 2026-08-13

---

## Scope

This runbook covers migrations 137–145, with special attention to the **shared-ledger migrations** 143, 144, and 145 which are NOT yet applied to any shared environment.

---

## Pre-Migration Checklist

```
[ ] Database backup confirmed and verified (restore tested)
[ ] Maintenance window confirmed with stakeholders
[ ] Current migration baseline reviewed (migration-integrity-baseline.json)
[ ] No active kill switches on target environment
[ ] No active beta cohort sessions
[ ] Apply in isolated transaction where possible
```

---

## Migration Apply Order

```
137_phase191b_printhouse_signup_requests.sql
138_phase191c_printhouse_onboarding_profiles.sql
139_phase191d_machine_capabilities_migration.sql
140_phase191e_materials_capacity_leadtimes.sql
141_phase191f_governed_pricing_configuration.sql
142_phase191g_shipping_and_integration_readiness.sql
143_phase191h_marketplace_review_and_controlled_activation.sql  ← CRITICAL
144_phase192e2_distributed_dispatch_idempotency.sql              ← CRITICAL
145_phase192f_runtime_observability_kill_switches.sql            ← CRITICAL
```

Apply in strict numerical order. Do not skip or reorder.

---

## Critical Migration Details

### Migration 143 — Marketplace Review & Controlled Activation

Creates:
- `printhouse_marketplace_reviews`
- `printhouse_review_snapshots`
- `printhouse_activation_grants` ← **governing table for all runtime capabilities**
- `printhouse_marketplace_review_audits`

**Mutability**: This migration establishes the governance foundation. Once applied, the `printhouse_activation_grants` table is the authoritative source for runtime capability decisions. No unilateral SQL grants outside admin governance service are permitted.

---

### Migration 144 — Distributed Dispatch Idempotency

Creates:
- `manufacturing_dispatches` with `UNIQUE KEY uq_order_dispatch (order_id)`
- `printer_telemetry_events` with `UNIQUE KEY uq_tenant_event (tenant_id, event_id)`

**Effect**: Provides durable cross-process idempotency guarantees. Once applied, duplicate dispatches and telemetry events are enforced at DB level.

---

### Migration 145 — Runtime Kill Switches

Creates:
- `runtime_kill_switches`
- `runtime_incidents`

**Effect**: Provides persistent kill switch audit records. In-memory kill switch state takes effect immediately on API startup; DB persistence ensures audit trail.

---

## Post-Migration Validation

```bash
# Verify tables exist
SHOW TABLES LIKE 'printhouse_activation_grants';
SHOW TABLES LIKE 'manufacturing_dispatches';
SHOW TABLES LIKE 'runtime_kill_switches';

# Verify unique constraints
SHOW INDEX FROM manufacturing_dispatches WHERE Key_name = 'uq_order_dispatch';
SHOW INDEX FROM printer_telemetry_events WHERE Key_name = 'uq_tenant_event';

# Run health check
GET /api/admin/runtime/health
```

---

## Rollback Limitations

```
ROLLBACK_SUPPORTED: NO

Migrations 143, 144, 145 are FORWARD-ONLY.
```

There is no safe DDL rollback for these migrations once applied to a shared environment. Recovery from migration errors must use **containment** (kill switches, tenant suspension) rather than DDL teardown.

If a migration fails mid-apply:
1. Do NOT re-apply. Contact engineering immediately.
2. Do NOT manually delete partially-created tables.
3. Restore from pre-migration backup if data integrity is at risk.

---

## Append-Only Rule

Once any shared environment has received migration 143, 144, or 145:
```
APPEND_ONLY: ENFORCED
```

New requirements must be addressed via new migrations (146+), never by modifying existing files.

---

## RUNBOOK_VERSION: 1.0
