# Phase 192E: Production Dispatch Lifecycle

## 1. Dispatch State Transitions
```text
EVALUATED -> QUEUED -> SENT -> ACKNOWLEDGED
```

## 2. Invariants
- `DISPATCH_CAN_RESELECT_TARGET: NO` (Consumes pre-existing committed routing decision).
- `PRICING_MUTATION_FROM_DISPATCH: NO` (Preserves sealed pricing snapshot).
