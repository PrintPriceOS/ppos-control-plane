# docs/runbooks/PHASE_192G_CONTROLLED_BETA_RUNBOOK.md

## Phase 192G — Controlled Beta Operator Runbook

### Version: 1.0 — 2026-08-13

---

## Pre-Flight Checks

```bash
# 1. Verify runtime health
GET /api/admin/runtime/health
# Expected: { "overallStatus": "HEALTHY", "activeKillSwitchesCount": 0 }

# 2. Confirm no active kill switches
GET /api/admin/runtime/kill-switches
# Expected: { "killSwitches": [] }

# 3. Confirm migrations applied
# Verify tables exist: runtime_kill_switches, runtime_incidents,
#   manufacturing_dispatches, printer_telemetry_events,
#   printhouse_activation_grants

# 4. Confirm database backup exists
# Contact DBA / infra owner before proceeding
```

---

## Beta Enrollment

Beta enrollment is **manual only**. Automatic enrollment is prohibited.

```bash
# Step 1: Ensure Printhouse has completed full onboarding (191B–191G)
# Step 2: Conduct marketplace review (191H)
# Step 3: Admin-governed controlled activation:
POST /api/admin/printhouse-reviews/:reviewId/activate
# This grants all 4 capabilities atomically

# Step 4: Confirm effective capabilities
GET /api/admin/runtime/health  # check domain health

# Step 5: Add to beta cohort allowlist (operator-managed configuration)
# Note: beta allowlisting cannot grant capabilities not already present
```

---

## Inspect Health

```bash
GET /api/admin/runtime/health
# Returns: overallStatus, activeKillSwitchesCount, per-domain status + metrics
```

| Domain Status | Meaning | Action |
|--------------|---------|--------|
| HEALTHY | Normal operation | None |
| DEGRADED | Elevated failures | Monitor closely |
| UNHEALTHY | Critical failure rate | Investigate, consider kill switch |
| PAUSED | Active kill switch | Check active switches |

---

## Locate an Order

Orders are traced via:
- `orderId` → routing decision (`governedOrderRoutingService`)
- `orderId` → dispatch record (`governedProductionDispatchService`)
- `tenantId` + `orderId` → telemetry events (`printerSyncService`)
- Cross-reference `traceId` in structured logs

---

## Enable Kill Switch

```bash
POST /api/admin/runtime/kill-switches
Headers: x-user-role: PLATFORM_OPERATOR, x-user-id: operator-001
Body:
{
  "scope": "GLOBAL",
  "capability": "PRODUCTION_DISPATCH_ALLOWED",
  "reasonCode": "DISPATCH_ANOMALY",
  "description": "Duplicate dispatch investigation"
}
# Returns: { "killSwitch": { "id": "ks_...", "status": "ACTIVE" } }
```

**Scope options**: GLOBAL (all tenants) | TENANT (specific tenant) | SITE (specific site)
**Capability options**: ALL | MARKETPLACE_VISIBLE | LIVE_QUOTING_ALLOWED | JOB_ROUTING_ALLOWED | PRODUCTION_DISPATCH_ALLOWED

---

## Clear Kill Switch

```bash
POST /api/admin/runtime/kill-switches/{id}/clear
Headers: x-user-role: PLATFORM_OPERATOR, x-user-id: operator-001
# Returns: { "cleared": true }
```

---

## Suspend a Tenant

```bash
POST /api/admin/printhouse-reviews/{reviewId}/suspend
# Revokes routing and dispatch capabilities immediately
# Historical data preserved
```

---

## Respond to Duplicate Dispatch Suspicion

1. **CONTAIN**: Activate GLOBAL PRODUCTION_DISPATCH_ALLOWED kill switch immediately
2. **INSPECT**: Query `manufacturing_dispatches` for duplicate `order_id` entries
3. **VERIFY**: DB unique constraint `uq_order_dispatch` should prevent true duplicates
4. **ASSESS**: If true duplicate found → escalate to P0
5. **RECOVER**: After root cause resolved, clear kill switch
6. **DOCUMENT**: Record incident timeline in `runtime_incidents`

---

## Respond to Pricing Anomaly

1. **CONTAIN**: Activate LIVE_QUOTING_ALLOWED kill switch
2. **INSPECT**: Check `printhouse_price_books` for unauthorized mutations
3. **VERIFY**: Compare pricing snapshot hashes on affected orders
4. **ASSESS**: If sealed snapshot mutated → P0 escalation
5. **RECOVER**: After root cause resolved, clear kill switch

---

## Respond to Telemetry Loss

1. **INSPECT**: Check dispatch domain health status (should show DEGRADED)
2. **VERIFY**: Query `printer_telemetry_events` for recent events
3. **ASSESS**: Jobs stuck in IN_PRODUCTION → operator must manually verify physical status
4. **CONTAIN** if needed: PRODUCTION_DISPATCH_ALLOWED kill switch to pause new work
5. **RECOVER**: After connectivity restored, events will resume

---

## Abort Beta

1. Activate GLOBAL/ALL kill switch to halt all new work
2. Suspend affected tenants if cross-tenant issue suspected
3. Preserve all runtime state — do NOT delete records
4. Notify cohort Printhouses
5. Escalate to engineering and decision authority

---

## Recovery

1. Identify and resolve root cause
2. Clear kill switches one at a time
3. Verify health after each clear
4. Resume with reduced cohort if needed

---

## RUNBOOK_VERSION: 1.0
## ENVIRONMENT_AWARE: YES (no hardcoded production URLs or credentials)
