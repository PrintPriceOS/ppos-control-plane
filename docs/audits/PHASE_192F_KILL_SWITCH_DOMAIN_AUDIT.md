# PHASE_192F_KILL_SWITCH_DOMAIN_AUDIT.md

## Phase 192F — Runtime Kill Switch Domain Audit

### Audit Date
2026-08-13

### Scope
End-to-end audit of the emergency kill switch override system introduced in Phase 192F.

---

## Domain Overview

The Runtime Kill Switch system provides a governed emergency override layer sitting above activation grants. It enforces the invariant:

```
EFFECTIVE_CAPABILITY = ACTIVATION_GRANT AND NOT_SUSPENDED AND NOT_KILL_SWITCHED
```

Kill switches can **only DENY** a capability. They can never grant a capability not already present in the activation grant record.

---

## Scope Precedence Model

| Scope      | Target       | Priority |
|------------|--------------|----------|
| GLOBAL     | ALL          | 1 (highest) |
| TENANT     | tenant_id    | 2 |
| PRINTHOUSE | printhouse_id | 3 |
| SITE       | site_id      | 4 |

Evaluation short-circuits at the highest applicable scope.

---

## Invariants

| Invariant | Status |
|-----------|--------|
| KILL_SWITCH_CAN_GRANT_CAPABILITY: NO | VERIFIED |
| NO_UNAUDITED_KILL_SWITCH_STATE | VERIFIED |
| FAIL_CLOSED_ON_ERROR | VERIFIED |
| SCOPE_PRECEDENCE_ENFORCED | VERIFIED |

---

## Governed Capabilities

All four capability grants from Phase 191H are subject to kill switch evaluation:

- `MARKETPLACE_VISIBLE`
- `LIVE_QUOTING_ALLOWED`
- `JOB_ROUTING_ALLOWED`
- `PRODUCTION_DISPATCH_ALLOWED`

Additionally, capability `ALL` activates a blanket override across all four grants.

---

## Kill Switch State Machine

```
INACTIVE -> ACTIVE (on createKillSwitch)
ACTIVE   -> CLEARED (on clearKillSwitch)
```

There is no REACTIVATION from CLEARED. New kill switches must be issued explicitly.

---

## Audit Log Coverage

Every state transition emits a structured log entry:
- `runtime_kill_switch_activated` (WARN level)
- `runtime_kill_switch_cleared` (INFO level)

DB write to `runtime_kill_switches` is attempted on every state change.

---

## KILL_SWITCH_AUDIT_COVERAGE: COMPLETE
