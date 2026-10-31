# Phase 192C: Matching Model

## 1. Matching Formula

$$\text{MATCH\_ELIGIBLE} = \text{DISCOVERY\_ELIGIBLE} \land \text{CAPABILITY\_COMPATIBLE} \land \text{MATERIAL\_COMPATIBLE} \land \text{FORMAT\_COMPATIBLE} \land \text{SHIPPING\_COMPATIBLE}$$

## 2. Invariant Separation
```text
DISCOVERABLE
  ≠
MATCHED
  ≠
ROUTABLE
  ≠
DISPATCHABLE
```

A node may be `DISCOVERABLE` and `MATCHED` without holding `JOB_ROUTING_ALLOWED` or `PRODUCTION_DISPATCH_ALLOWED`.
