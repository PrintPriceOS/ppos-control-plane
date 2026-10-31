# docs/runbooks/PHASE_192G_EMERGENCY_STOP_RUNBOOK.md

## Phase 192G — Emergency Stop Runbook

### Version: 1.0 — 2026-08-13

### Priority Order

```
1. CONTAIN   — stop new harm immediately
2. PRESERVE  — do not delete runtime records
3. INSPECT   — understand what happened
4. RECOVER   — restore safe state
5. RESUME    — controlled restart of work
```

---

## Step 1: CONTAIN

**Activate a global kill switch immediately.**

```bash
POST /api/admin/runtime/kill-switches
{
  "scope": "GLOBAL",
  "capability": "ALL",
  "reasonCode": "EMERGENCY_STOP",
  "description": "Emergency stop — investigation in progress"
}
```

Expected: all 4 capabilities denied for all tenants across all scopes.

**Verify containment:**
```bash
GET /api/admin/runtime/health
# Expected: overallStatus: PAUSED
```

---

## Step 2: PRESERVE

**Do NOT delete any runtime records.**

Specifically:
- Do NOT delete `manufacturing_dispatches` entries
- Do NOT delete `printer_telemetry_events` entries
- Do NOT delete `runtime_kill_switches` entries
- Do NOT truncate or alter `printhouse_activation_grants`

Take a **read-only snapshot** of affected tables if possible.

---

## Step 3: INSPECT

Collect evidence:

```bash
# Active kill switches
GET /api/admin/runtime/kill-switches

# Health per domain
GET /api/admin/runtime/health

# Structured logs from API process
# Filter by: traceId, orderId, tenantId, dispatch.failed, routing.denied

# Check for duplicate dispatches:
SELECT order_id, COUNT(*) FROM manufacturing_dispatches GROUP BY order_id HAVING COUNT(*) > 1;

# Check telemetry state for affected jobs:
SELECT * FROM printer_telemetry_events WHERE tenant_id = ? ORDER BY created_at DESC;
```

---

## Step 4: RECOVER

Prioritized recovery sequence:

| Defect Type | Recovery Action |
|-------------|----------------|
| Duplicate dispatch suspected | Investigate DB unique constraint; if constraint is intact, duplicate is logical not physical |
| Pricing anomaly | Compare snapshot hashes; if sealed snapshot intact, pricing is protected |
| Telemetry loss | Wait for printer reconnect; no state mutation needed |
| Kill switch bypass | Escalate P0 immediately; do NOT resume until bypass is patched |
| Migration failure | Do NOT apply forward; contact DBA |

**Do not clear kill switches until root cause is confirmed.**

---

## Step 5: RESUME

After root cause resolved:

```bash
# Clear kill switch(es) one at a time
POST /api/admin/runtime/kill-switches/{id}/clear

# Verify health after each clear
GET /api/admin/runtime/health

# Monitor health for 15 minutes before resuming full cohort
```

Resume with reduced cohort if confidence is limited.

---

## Escalation

| Severity | Trigger | Action |
|----------|---------|--------|
| P0 | Cross-tenant exposure, duplicate physical dispatch, kill-switch bypass | Immediate engineering + decision authority |
| P1 | Sealed pricing mutation, migration failure | Engineering escalation |
| P2 | Sustained UNHEALTHY domain, telemetry loss > 30 min | Engineering investigation |
| P3 | Single DEGRADED event, transient failure | Monitor and document |

---

## RUNBOOK_VERSION: 1.0
## NO_DESTRUCTIVE_RECOVERY_INSTRUCTIONS: VERIFIED
