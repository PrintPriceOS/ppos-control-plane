# PHASE_192F_KILL_SWITCH_SCOPE_PRECEDENCE_MODEL.md

## Phase 192F — Kill Switch Scope Precedence Model

### Audit Date
2026-08-13

---

## Scope Hierarchy

Kill switches are evaluated in strict descending priority order. The first applicable DENY wins:

```
1. GLOBAL DENY  (scope = 'GLOBAL', targetId = 'ALL')
2. TENANT DENY  (scope = 'TENANT', targetId = tenantId)
3. PRINTHOUSE DENY (scope = 'PRINTHOUSE', targetId = printhouseId)
4. SITE DENY    (scope = 'SITE', targetId = siteId)
```

### Evaluation Algorithm

```javascript
// 1. Check GLOBAL DENY
for (ks of activeKillSwitches where scope === 'GLOBAL'):
  if (ks.capability === 'ALL' or ks.capability === requestedCap):
    return { killSwitched: true, scope: 'GLOBAL' }

// 2. Check TENANT/PRINTHOUSE DENY
for (ks of activeKillSwitches where scope in ['TENANT', 'PRINTHOUSE']):
  if (ks.targetId === tenantId and ks.capability matches requestedCap):
    return { killSwitched: true, scope: ks.scope }

// 3. Check SITE DENY
for (ks of activeKillSwitches where scope === 'SITE'):
  if (ks.targetId === siteId and ks.capability matches requestedCap):
    return { killSwitched: true, scope: 'SITE' }

// PASS — no active kill switch applies
return { killSwitched: false }
```

---

## Precedence Matrix

| GLOBAL Switch | TENANT Switch | SITE Switch | Effective Result |
|:---:|:---:|:---:|:---:|
| ACTIVE | - | - | DENY (GLOBAL wins) |
| - | ACTIVE | - | DENY (TENANT wins) |
| - | - | ACTIVE | DENY (SITE) |
| - | - | - | PASS (no override) |
| ACTIVE | ACTIVE | ACTIVE | DENY (GLOBAL wins, short-circuit) |

---

## Isolation

A TENANT-scoped kill switch for `tenant_A` does **not** affect `tenant_B`.
A SITE-scoped kill switch for `site_X` does **not** affect `site_Y` in the same tenant.

---

## SCOPE_PRECEDENCE_MODEL_COVERAGE: COMPLETE
