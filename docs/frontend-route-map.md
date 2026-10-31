# Frontend Route Map — Industrial Operations

| Route | Component | API Dependencies | Empty State | Error State |
|---|---|---|---|---|
| `/admin/industrial` | `IndustrialOpsPage` | `/api/admin/telemetry/industrial` | Tab dependent | Overlay Toast |
| `/admin/industrial#orchestration` | `OrchestrationTab` | `/api/admin/telemetry/industrial` | "No active nodes" | Degradation Alert |
| `/admin/industrial#incidents` | `IncidentRegistryTab` | `/api/admin/orchestration/incidents` | "Zero critical incidents" | Forensic Failure |
| `/admin/industrial#lifecycle` | `LifecyclePolicyTab` | `/api/admin/orchestration/lifecycle` | "Default Global Policy" | Policy Sync Error |
| `/preflight/jobs` | `PreflightJobsPage` | `/api/admin/jobs?type=preflight` | "Empty Queue" | API Degradation |
| `/telemetry` | `TelemetryTab` | `/api/admin/telemetry/snapshot` | Skeletal Loader | Error Badge |
| `/forensics` | `ForensicsTab` | `/api/admin/audit` | "No causality found" | Trace Error |
