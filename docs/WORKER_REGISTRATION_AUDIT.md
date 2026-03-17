# WORKER_REGISTRATION_AUDIT

**Version**: 1.9.0
**Domain**: Runtime Visibility & Observability

## 🔍 Discovery Mechanism Audit

| Dimension | Status | Detail |
| :--- | :--- | :--- |
| **Registration Mode** | 🔴 NONE | Workers are currently anonymous. No explicit self-registration in Redis is implemented. |
| **Discovery Path** | 🔴 WEAK | The Control Plane attempts to list workers via `bull:<queue>:workers` (an internal BullMQ key), but this set is often empty or unreliable without explicit worker IDs. |
| **Heartbeat** | 🔴 MISSING | No periodic heartbeat mechanism exists. "Last seen" cannot be determined. |
| **Metadata** | 🔴 ANONYMOUS | Hostname, version, and load metadata are not collected. |

## 📡 Analysis of BullMQ Primitives
BullMQ handles internal worker lists for task distribution, but these are not designed as a "Service Registry". To achieve reliable operator visibility, we need a lightweight, explicit registry.

## 📋 Recommendations for Phase 2
1. **Explicit Identity**: Assign a unique `worker_id` (e.g., `preflight-worker-<env>-<uuid>`) upon startup.
2. **Redis Heartbeat**: Implement a TTL-based key (e.g., `ppos:node:<id>`) that the worker refreshes every 10-30 seconds.
3. **Registry Set**: Maintain a Redis Set (`ppos:nodes:active`) containing all registered worker IDs for fast discovery.
