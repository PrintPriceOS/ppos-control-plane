# CONTROL_PLANE_WORKER_VISIBILITY_REPORT

**Status**: ✅ ACTIVATED (REAL-TIME DISCOVERY)
**Date**: 2026-03-17

The Control Plane now utilizes a canonical worker registry for reliable discovery and load monitoring.

## 📡 Visibility Features

### 1. Reliable Discovery
The `/api/system/workers` endpoint has been upgraded to query the `ppos:workers:active` set.
- **Precision**: Real-time heartbeat tracking provides an exact count of active worker nodes.
- **Fallback**: If the canonical registry is empty, the system gracefully degrades to BullMQ-style discovery.

### 2. Node Metadata
The dashboard now surfaces:
- **Hostname**: The specific machine running the code.
- **Node ID**: Unique identifier for log correlation.
- **Last Seen**: Relative time since the last successful heartbeat.
- **Queue Role**: Confirms which specific queue the node is consuming.

### 3. Automatic Cleanup
Implemented a "Lazy Cleanup" mechanism. If the control plane encounters an ID in the active set that doesn't have a corresponding metadata key (EXPIRED), it automatically removes that ID from the set.

---

## ✅ Discovery State

| Dimension | Working? | Detail |
| :--- | :--- | :--- |
| **Worker Count** | Yes | From `ppos:workers:active` SCARD/SMEMBERS |
| **Worker Details** | Yes | Hydrated from `ppos:worker:<id>` |
| **Status** | Yes | Calculated via TTL and state field |
| **Failover Discovery** | Yes | Legacy BullMQ fallback included |
