# Phase 192E: Production Queue Dispatch Eligibility Model

## 1. Eligibility Formula

$$\text{DISPATCH\_ELIGIBLE} = \text{VALID\_COMMITTED\_ROUTE} \land \text{PRODUCTION\_DISPATCH\_ALLOWED} \land \text{NOT\_SUSPENDED} \land \text{VALID\_TARGET\_SITE} \land \text{VALID\_MACHINE}$$

## 2. Fail-Closed Principles
1. **Unrouted Orders**: Orders without a `COMMITTED` routing decision (Phase 192D) are rejected (`DISPATCH_ROUTE_REQUIRED`).
2. **Missing Grant**: Nodes missing `PRODUCTION_DISPATCH_ALLOWED = true` are rejected (`PRINTHOUSE_CAPABILITY_NOT_GRANTED`).
3. **Suspended Nodes**: Suspended target nodes fail closed (`PRINTHOUSE_SUSPENDED`).
4. **TOCTOU Protection**: Immediate re-verification of capability grants at dispatch commitment time prevents stale authorization races.
