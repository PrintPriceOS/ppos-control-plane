# Operational Stabilization Plan — Phase 11 & Beyond

Following the successful deployment of the **Industrial Orchestration Layer (Phase 10)**, the platform enters a dedicated **Operational Stabilization Phase**. The objective is to transition from architectural readiness to real-world infrastructure maturity.

## 1. High-Fidelity Worker Observability (Priority 1)

The "Worker Fleet Model" is only as good as its inputs. We must bridge the gap between the Control Plane and low-level worker signals.

### Worker Telemetry Contract
Every worker MUST emit a heartbeat every 30-60 seconds to `/api/admin/orchestration/heartbeat` with the following payload:

```json
{
  "workerId": "worker-uuid",
  "hostname": "worker-node-01",
  "status": "HEALTHY",
  "metrics": {
    "memoryPressure": 65,      // Percentage
    "cpuUsage": 45,           // Percentage
    "diskUsage": 12,          // Percentage (Temp storage)
    "gsLatencyMs": 4500,      // Last Ghostscript execution time
    "failureRate": 0.5,       // Percentage of failed jobs in last 10m
    "avgJobLatency": 12000    // Average processing time
  },
  "capabilities": {
    "large_doc_support": true,
    "color_normalization": true,
    "trimbox_repair": true
  }
}
```

## 2. Artifact Registry Backfill

To ensure forensic continuity, we need to index pre-Phase 10 documents into the `preflight_artifacts` table.

- **Strategy**: Scheduled scan of the production storage bucket.
- **Verification**: Generate SHA-256 checksums and reconstruct lineage from job metadata.
- **Goal**: 100% forensic coverage for the last 90 days of operations.

## 3. Industrial Stress & Soak Testing

Validate the **Fail-Loud** and **Circuit-Breaker** logic under simulated pressure.

- **Soak Testing**: Run the platform at 80% capacity for 48 hours.
- **Chaos Injection**:
    - Simulate a "Zombie Worker" (heartbeat sent, but all jobs fail).
    - Simulate "Storage Latency" (artifact registry slows down).
    - Simulate "Large Document Flood" (test queue isolation and starvation prevention).

## 4. Centralized Observability

Migrate from local structured logs to a unified stack.

- **Logging**: Export `logger.js` output to Grafana Loki using the existing `traceId` and `forensic_trace_id`.
- **Metrics**: Export `telemetryService` aggregates to Prometheus/Grafana.
- **Dashboards**:
    - **NOC Heatmap**: Regional worker health and latency.
    - **Queue Pressure**: BullMQ depth vs. worker concurrency.
    - **Artifact Growth**: Storage tiering effectiveness (HOT vs. WARM vs. COLD).

## 5. Security Posture Hardening

Finalize the RBAC enforcement across all federation nodes.

- **Action**: Implement "Advisory Denials" (log but allow) for 1 week, followed by "Hard Denials" (403 Forbidden).
- **Audit**: Verify that all `SUPER_ADMIN` actions are correlated with a valid `request_id`.
