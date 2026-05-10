# Telemetry Specification — PrintPrice OS Control Plane

## Standard Telemetry Event Shape

Every telemetry event emitted by any service **must** conform to this structure:

```json
{
  "timestamp": "2026-05-10T14:00:00.000Z",
  "severity": "INFO",
  "service": "autonomousRerouteService",
  "scope": "rerouting",
  "event": "DISPATCH_REROUTED",
  "traceId": "trace_1715349200000_ab3f9e2c",
  "metadata": {
    "dispatchId": "d_abc123",
    "fromNodeId": "node_01",
    "toNodeId": "node_02",
    "reason": "SLA_BREACH"
  }
}
```

---

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | ISO 8601 string | Event time (UTC) |
| `severity` | enum | One of: `DEBUG`, `INFO`, `WARN`, `ERROR`, `CRITICAL` |
| `service` | string | Emitting service name (camelCase) |
| `scope` | string | Functional domain (e.g. `rerouting`, `federation`) |
| `event` | string | Event identifier (SCREAMING_SNAKE_CASE) |
| `traceId` | string | Correlation ID (use `telemetryIntegrityService._generateTraceId()`) |
| `metadata` | object | Contextual data (arbitrary key-values, no PII) |

---

## Prohibited Patterns

```js
// ❌ DO NOT emit null error fields
{ event: 'REROUTE_FAILED', error: null }

// ❌ DO NOT omit required fields
{ event: 'SLA_BREACH' }  // missing timestamp, severity, service, scope, traceId

// ❌ DO NOT leak credentials
{ metadata: { token: '...', password: '...' } }

// ✓ CORRECT
{
  timestamp: new Date().toISOString(),
  severity: 'ERROR',
  service: 'slaMonitoringService',
  scope: 'sla',
  event: 'SLA_BREACH_DETECTED',
  traceId: 'trace_1715349200000_ab3f9e2c',
  metadata: { dispatchId: 'd_abc123', breachType: 'TIMEOUT' }
}
```

---

## Severity Levels

| Level | Usage |
|-------|-------|
| `DEBUG` | Detailed internals, disabled in production |
| `INFO` | Normal operational events |
| `WARN` | Recoverable issues, degraded performance |
| `ERROR` | Failures that require attention |
| `CRITICAL` | System-threatening conditions |

---

## Using TelemetryIntegrityService

```js
const telemetry = require('./telemetryIntegrityService');

// Build a standard event
const event = telemetry.buildEvent({
  service: 'federationRegistryService',
  scope: 'federation',
  event: 'FACTORY_REGISTERED',
  severity: 'INFO',
  metadata: { factoryId: 'f_001', region: 'EU-WEST' }
});

// Verify shape
const { valid, missing, warnings } = telemetry.verifyTelemetryShape(event);

// Detect drift across batch
const { driftRate } = telemetry.detectTelemetryDrift(events);

// Aggregate health from service signals
const health = telemetry.aggregateHealthSignals([
  { service: 'slaMonitor', ok: true, latencyMs: 23 },
  { service: 'federation', ok: false, latencyMs: 450 },
]);
// → { score: 50, passed: 1, failed: 1, failedServices: ['federation'] }
```

---

## API Response Shape

All API responses must conform to:

### Success
```json
{
  "ok": true,
  "data": { ... }
}
```

### Failure
```json
{
  "ok": false,
  "error": "Human-readable description",
  "code": "ERROR_CODE_SCREAMING_SNAKE",
  "diagnostics": {
    "service": "federationRegistryService",
    "traceId": "trace_...",
    "timestamp": "2026-05-10T14:00:00.000Z"
  }
}
```

### Degraded (partial success)
```json
{
  "ok": true,
  "degraded": true,
  "warning": "Fallback mode — redis unavailable",
  "data": { ... }
}
```
