# Phase 192D: Concurrency & Idempotency Audit

## 1. Idempotency Guarantees
Repeated routing requests for the same `orderId` and `candidatePrinthouseId` return the existing committed decision without creating duplicate decision entities (`idempotent: true`).

## 2. Supersession & Audit History
When an explicit reroute request is committed for an existing order, previous active decisions transition to `SUPERSEDED` status with full audit timestamps, preserving immutable historical lineage.
