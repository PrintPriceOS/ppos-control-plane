# docs/audits/PHASE_192G_OPERATOR_READINESS.md

## Phase 192G — Operator Readiness

### Audit Date
2026-08-13

---

## Operator Questions Answerable via Current Tooling

| Question | Available Tool | Result |
|----------|---------------|--------|
| Are quotes failing? | `GET /api/admin/runtime/health` → quoting domain | YES |
| Are routing requests denied? | `GET /api/admin/runtime/health` → routing domain | YES |
| Are dispatches failing? | `GET /api/admin/runtime/health` → dispatch domain | YES |
| Is telemetry arriving? | `GET /api/admin/runtime/health` → telemetry domain | YES |
| Is a kill switch active? | `GET /api/admin/runtime/kill-switches` | YES |
| Which tenant/site affected? | Kill switch scope/targetId field | YES |
| Activate emergency stop | `POST /api/admin/runtime/kill-switches` | YES |
| Clear emergency stop | `POST /api/admin/runtime/kill-switches/:id/clear` | YES |
| Suspend tenant | `POST /api/admin/printhouse-reviews/:id/suspend` | YES (Phase 191H) |

---

## Operator Access Verification

| Role | Operation | Status |
|------|-----------|--------|
| `SUPER_ADMIN` | Inspect health | PASS |
| `PLATFORM_OPERATOR` | Activate dispatch kill | PASS |
| `GLOBAL_ADMIN` | Clear kill switch | PASS |
| Unauthorized user | Any runtime endpoint | DENIED (403 FORBIDDEN_OPERATIONAL_ROLE) |

---

## Kill Switch Blast-Radius Reference

| Scope / Capability | Affects |
|-------------------|---------|
| GLOBAL / PRODUCTION_DISPATCH_ALLOWED | All new dispatches across all tenants |
| GLOBAL / JOB_ROUTING_ALLOWED | All new routing decisions |
| GLOBAL / LIVE_QUOTING_ALLOWED | All new live quote calculations |
| GLOBAL / MARKETPLACE_VISIBLE | All discovery results (nodes hidden) |
| TENANT / PRODUCTION_DISPATCH_ALLOWED | New dispatches for specific tenant only |
| SITE / PRODUCTION_DISPATCH_ALLOWED | New dispatches for specific site only |
| GLOBAL / ALL | All 4 capabilities denied across all tenants |

---

## Gaps

- No persistent dashboard UI for kill switch state (API-only; operator needs direct HTTP access or admin panel integration)
- No automated alerting on DEGRADED/UNHEALTHY domain health (manual polling required)

These are P3 non-blocking improvements for Stage 2+.

---

## OPERATOR_DIAGNOSTIC_COVERAGE: PASS
## OPERATOR_READINESS: CONDITIONAL (no automated alerting yet)
