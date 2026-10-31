# Risk Register — Phase 10 Industrial Operations

| Risk | Severity | Likelihood | Detection | Mitigation | Owner |
|---|---|---|---|---|---|
| **Migration Conflict** | High | Low | `verify-industrial-schema.js` | Idempotent `CREATE TABLE IF NOT EXISTS` used. | Ops |
| **Worker Heartbeat Lag** | Medium | Medium | Orchestration Tab (OFFLINE state) | 60s timeout threshold for online status. | Infra |
| **Lifecycle Purge Bug** | Critical | Low | Audit Log (MASS_PURGE events) | `LEGAL_HOLD` flag and dry-run testing. | Compliance |
| **Large Doc Routing** | Medium | Low | Queue Metrics (Stuck jobs) | Isolation of `preflight_large_document` queue. | Arch |
| **RBAC Leak** | High | Low | `audit_denied` events | Middleware `auth.js` hardening. | Security |
| **Telemetry Noise** | Low | High | Telemetry Dashboard | Anomaly detection smoothing in `telemetryService`. | Data |
| **Memory Pressure** | High | Medium | Worker Health Scores | Automated quarantine when memory > 80%. | Orchestrator |

## Mitigation Strategies
1. **FAIL LOUD**: System services will throw explicit errors rather than falling back to empty/synthetic states.
2. **AUDIT EVERYTHING**: Every state change in the industrial layer is recorded with a `request_id` and `timestamp`.
3. **ISOLATION**: Heavy loads are partitioned into dedicated queues to prevent platform-wide starvation.
