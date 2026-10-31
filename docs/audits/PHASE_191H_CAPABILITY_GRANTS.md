# Phase 191H: Explicit Capability Grants Matrix

| Capability Flag | Scope | Default Pre-Activation | Controlled Activation State | Suspension State | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `marketplace_visible` | Public Listing | `false` | `true` | `false` | Node visible in public marketplace directory |
| `live_quoting_allowed` | Commercial | `false` | `true` | `false` | Governed live pricing calculation allowed for binding quotes |
| `job_routing_allowed` | Operations | `false` | `true` | `false` | Automated order routing engine allowed to dispatch jobs |
| `production_dispatch_allowed` | Operations | `false` | `true` | `false` | Physical machine job queue dispatch allowed |

All capability flags evaluate to `false` when activation status is `SUSPENDED` or `NOT_ACTIVATED`.
