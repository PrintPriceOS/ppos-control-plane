# Phase 192E: Idempotency & Retry Model

## 1. Delivery Semantics
```text
DISPATCH_DELIVERY_SEMANTICS: AT_LEAST_ONCE_WITH_IDEMPOTENT_CONSUMER
```

## 2. Idempotency Guarantees
Repeated production queue dispatch requests for the same `orderId` return the existing committed dispatch record (`idempotent: true`), preventing duplicate production job creation.
