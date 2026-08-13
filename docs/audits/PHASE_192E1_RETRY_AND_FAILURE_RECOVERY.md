# Phase 192E.1: Retry & Failure Recovery Model

## 1. Delivery & Retry Semantics
```text
DISPATCH_DELIVERY_SEMANTICS: AT_LEAST_ONCE_WITH_IDEMPOTENT_CONSUMER
```

## 2. Tested Failure Recovery Scenarios
- **Worker Network Retry**: Retries after transient network delays safely return existing dispatch records without creating duplicate machine execution entries (`DUPLICATE_PRODUCTION_JOB = 0`).
- **ACK Loss Protection**: Consumer idempotency prevents duplicate execution when ACK persistence fails during network transmission.
