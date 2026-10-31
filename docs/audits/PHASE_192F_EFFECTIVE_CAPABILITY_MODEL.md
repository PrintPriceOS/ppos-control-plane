# PHASE_192F_EFFECTIVE_CAPABILITY_MODEL.md

## Phase 192F — Effective Capability Computation Model

### Audit Date
2026-08-13

---

## Formula

```
EFFECTIVE_CAPABILITY[cap] =
    ACTIVATION_GRANT[cap]      -- Phase 191H grant present and ACTIVE status
    AND NOT SUSPENDED          -- grant.status != 'SUSPENDED'
    AND NOT KILL_SWITCHED[cap] -- no active runtime_kill_switch matching scope/cap
```

### Component Sources

| Layer | Source | Evaluated By |
|-------|--------|-------------|
| Activation Grant | `printhouse_activation_grants` | `printhouseActivationAdapter.getCapabilities()` |
| Suspension | `grant.status = 'SUSPENDED'` | `printhouseActivationAdapter.requireCapability()` |
| Kill Switch | `runtime_kill_switches` (in-memory + DB) | `runtimeKillSwitchService.isCapabilityKillSwitched()` |

---

## Capability Grant Matrix with Kill Switch Overlay

| Activation Grant | Suspended | Kill Switched | Effective |
|:---:|:---:|:---:|:---:|
| TRUE | NO | NO | **TRUE** |
| TRUE | YES | NO | **FALSE** |
| TRUE | NO | YES | **FALSE** |
| FALSE | NO | NO | **FALSE** |
| FALSE | NO | YES | **FALSE** (invariant: can't grant what isn't there) |

---

## Invariant: KILL_SWITCH_CAN_GRANT_CAPABILITY = NO

Kill switches are evaluated **only** against capabilities that are already `true` from the activation grant. The code:

```javascript
for (const cap of SUPPORTED_CAPABILITIES) {
    if (rawCapabilities[cap]) {       // only apply if grant already true
        const ksCheck = await killSwitchService.isCapabilityKillSwitched(...)
        if (ksCheck.killSwitched) {
            effectiveCapabilities[cap] = false;  // can only set to false, never to true
        }
    }
}
```

This proves the invariant at the code level.

---

## EFFECTIVE_CAPABILITY_MODEL_COVERAGE: COMPLETE
