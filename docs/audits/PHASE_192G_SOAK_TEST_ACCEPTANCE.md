# docs/audits/PHASE_192G_SOAK_TEST_ACCEPTANCE.md

## Phase 192G — Soak Test Acceptance

### Audit Date
2026-08-13

---

## Soak Evidence Classification

```
SOAK_EVIDENCE: SHORT
SOAK_DURATION: ~30 seconds (automated test suite execution)
```

> **IMPORTANT**: This is an honest classification. The automated test suite covers correctness, isolation, idempotency, and concurrency semantics. It is NOT a substitute for a time-extended soak against a live production database with real traffic.

---

## What the Automated Suite Covers

| Category | Coverage |
|----------|---------|
| Discovery correctness | PASS (192C suite) |
| Quote correctness | PASS (192B suite) |
| Routing correctness | PASS (192D suite) |
| Dispatch idempotency | PASS (192E.1 + 192E.2 suites) |
| Telemetry state machine | PASS (192E.1 suite) |
| Kill switch activation / recovery | PASS (192F suite) |
| End-to-end lifecycle | PASS (192G golden path) |
| Duplicate dispatch prevention | PASS (DB unique constraint uq_order_dispatch) |
| Cross-process replay protection | PASS (DB unique constraint uq_tenant_event) |

---

## What Requires Operational Verification

| Category | Status |
|----------|--------|
| Memory trend over 24h | NOT_MEASURED (requires live infra) |
| DB connection pool trend | NOT_MEASURED (requires live infra) |
| Queue depth under sustained load | NOT_MEASURED (requires live infra) |
| Heartbeat / health latency under load | NOT_MEASURED (requires live infra) |

---

## Soak Classification Rationale

A meaningful operational soak requires:
- Live MySQL instance
- At least MODERATE duration (> 1 hour of realistic traffic)
- Memory/connection/queue metrics instrumentation

This is classified as `SHORT` / `SYNTHETIC_ONLY` and should be repeated as `STAGE_1` beta with real Printhouse workload.

---

## SOAK_TEST_ACCEPTANCE: SHORT_EVIDENCE_ONLY (see CONDITIONAL_GO conditions)
