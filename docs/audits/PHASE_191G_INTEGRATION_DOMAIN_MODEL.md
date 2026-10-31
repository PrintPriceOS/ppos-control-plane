# Phase 191G: Integration Domain Model

## 1. Supported Integration Categories
- `API`: Inbound REST API access keys.
- `WEBHOOK`: Outbound event webhook subscriptions.
- `JDF`: Job Definition Format workflow specifications.
- `JMF`: Job Messaging Format device communication status.
- `MIS`: Management Information System connector.
- `ERP`: Enterprise Resource Planning connector.
- `SFTP`: File transfer specification.

## 2. Configuration Lifecycle
```text
NOT_CONFIGURED ──> DRAFT ──> CONFIGURING ──> VALIDATING ──> READY
                                                │
                                                └──> ERROR / DISABLED
```
- **Readiness vs Routing**: A profile in `READY` status indicates valid configuration & connectivity testing. It does **NOT** grant authorization for live job dispatch (`production_routing` remains `DISABLED`).
