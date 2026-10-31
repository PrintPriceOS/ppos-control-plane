# Phase 192D: Governed Order Routing Decision Contract

## 1. Routing vs Dispatch Boundary
```text
ROUTING
=
Evaluating candidate matches & recording governed destination (Phase 192D)

DISPATCH
=
Sending production jobs to physical machine execution layer (Phase 192E)
```

## 2. Invariant Matrix
| Capability Grants | Route Decision Created | Production Job Created | Physical Dispatch Allowed |
| :--- | :--- | :--- | :--- |
| `JOB_ROUTING_ALLOWED = 0` | NO (403 Forbidden) | NO | NO |
| `JOB_ROUTING_ALLOWED = 1`, `PRODUCTION_DISPATCH_ALLOWED = 0` | **YES** | **NO (0)** | **NO (Phase 192E)** |
| `JOB_ROUTING_ALLOWED = 1`, `PRODUCTION_DISPATCH_ALLOWED = 1` | **YES** | **NO (Phase 192E)** | **NO (Phase 192E)** |
