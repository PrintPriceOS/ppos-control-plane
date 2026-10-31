# PHASE_192F_SECURITY_ACCEPTANCE.md

## Phase 192F — Security Acceptance

### Audit Date
2026-08-13

---

## Security Test Results

| Test | Result |
|------|--------|
| Invalid scope parameter rejected | PASS |
| Missing `reasonCode` parameter rejected | PASS |
| Non-existent kill switch clear handled safely | PASS |
| Kill switch cannot grant missing capability | PASS (INVARIANT VERIFIED) |
| Scoped kill switch isolated to target tenant | PASS |
| Global kill switch affects all tenants | PASS |

---

## Input Validation Boundary

```
createKillSwitch({scope, targetId, capability, reasonCode, description, actorId})
  -> Validates: scope in ['GLOBAL','TENANT','PRINTHOUSE','SITE']
  -> Validates: reasonCode is required (non-empty)
  -> Rejects invalid scope with KILL_SWITCH_INVALID_SCOPE (400)
  -> Rejects missing reasonCode with KILL_SWITCH_INVALID_PARAMETERS (400)
```

---

## Idempotency

If a kill switch with the same scope/target/capability is already ACTIVE, `createKillSwitch` returns:
```json
{ "idempotent": true, "killSwitch": { ... existing ... } }
```

No duplicate kill switches are created.

---

## Audit Trail

Every activation and clearing emits a structured log entry with:
- `event`, `killSwitchId`, `scope`, `targetId`, `capability`, `reasonCode`, `actorId`

DB write attempted to `runtime_kill_switches` table on every state change.

---

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| Unauthorized kill switch activation | Role-based authorization on all `/api/admin/runtime` endpoints |
| Kill switch granting missing capability | Code-level invariant: kill switch applied only after rawCapabilities[cap] === true |
| Kill switch without audit trail | Structured logs on activation and clearing; DB persistence attempted |
| Double-clearing a switch | clearKillSwitch returns `{ cleared: false, reason: KILL_SWITCH_NOT_FOUND_OR_ALREADY_CLEARED }` safely |

---

## SECURITY_ACCEPTANCE: PASS
