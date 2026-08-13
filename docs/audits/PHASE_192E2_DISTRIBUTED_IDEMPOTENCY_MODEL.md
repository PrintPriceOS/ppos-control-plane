# Phase 192E.2: Distributed Idempotency & Persistence Model

## 1. Idempotency Identity & Boundary
- **Durable Identity**: `order_id` (or `idempotency_key`) enforced by database unique constraint `UNIQUE KEY uq_order_dispatch (order_id)` on `manufacturing_dispatches`.
- **Role of `inFlightDispatches` Map**: Serves strictly as a `LOCAL_DUPLICATE_SUPPRESSION_OPTIMIZATION`. The authoritative security and idempotency boundary is backed by durable database unique constraints.

## 2. Cross-Process & Restart-Safe Execution
Simultaneous requests from independent Node.js processes or retries following a process restart attempt DB insert, receive duplicate key error `ER_DUP_ENTRY`, and fall back to querying the existing persisted dispatch record (`idempotent: true`).

Verified by [tests/production_dispatch_distributed_idempotency_test.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/production_dispatch_distributed_idempotency_test.js).
