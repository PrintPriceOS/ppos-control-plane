# PHASE_192F_RUNTIME_HEALTH_MODEL.md

## Phase 192F — Runtime Health & Observability Model

### Audit Date
2026-08-13

---

## Critical Separation of Concerns

```
HEALTHY != CAPABILITY_ENABLED
```

Runtime health measures **operational integrity** (service availability, error rates, latency).
Capability grants measure **governance** (whether a Printhouse is authorized to operate).

A healthy service can be capability-disabled (kill switched).
An unhealthy service may still have valid capability grants.

---

## Domain Health Statuses

| Status | Meaning |
|--------|---------|
| `HEALTHY` | Domain operating within normal parameters |
| `DEGRADED` | Domain experiencing elevated failure rate (>0 failures) |
| `UNHEALTHY` | Domain failure rate critically high (>5 failures) |
| `PAUSED` | Domain halted by an active kill switch override |

---

## Monitored Domains

| Domain | Capability | Metrics |
|--------|-----------|---------|
| `discovery` | MARKETPLACE_VISIBLE | requests, denials, failures |
| `quoting` | LIVE_QUOTING_ALLOWED | requests, denials, failures, durationMs |
| `routing` | JOB_ROUTING_ALLOWED | requests, denials, failures, durationMs |
| `dispatch` | PRODUCTION_DISPATCH_ALLOWED | requests, denials, failures, retries, durationMs |
| `telemetry` | PRODUCTION_DISPATCH_ALLOWED | events, rejections, replays, outOfOrder |

---

## Health Response Schema

```json
{
  "overallStatus": "HEALTHY | PAUSED",
  "activeKillSwitchesCount": 0,
  "evaluatedAt": "ISO-8601",
  "domains": {
    "quoting": {
      "status": "HEALTHY",
      "capabilityEnabled": true,
      "metrics": { "requests": 0, "failures": 0 }
    }
  }
}
```

---

## RUNTIME_HEALTH_MODEL_COVERAGE: COMPLETE
