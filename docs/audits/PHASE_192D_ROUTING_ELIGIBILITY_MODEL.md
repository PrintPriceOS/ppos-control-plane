# Phase 192D: Order Routing Eligibility Model

## 1. Eligibility Formula

$$\text{ROUTING\_ELIGIBLE} = \text{MATCH\_ELIGIBLE} \land \text{JOB\_ROUTING\_ALLOWED} \land \text{NOT\_SUSPENDED} \land \text{VALID\_ORDER} \land \text{VALID\_TARGET\_SITE}$$

## 2. Fail-Closed Principles
1. **Missing Grant**: Nodes missing `JOB_ROUTING_ALLOWED = true` are strictly ineligible for routing (`PRINTHOUSE_CAPABILITY_NOT_GRANTED`).
2. **Suspended Nodes**: Suspended target nodes fail closed (`PRINTHOUSE_SUSPENDED`).
3. **TOCTOU Protection**: Immediate re-verification of capability grants at decision commitment time prevents stale authorization races.
