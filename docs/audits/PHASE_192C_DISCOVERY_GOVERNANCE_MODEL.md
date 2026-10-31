# Phase 192C: Discovery Governance Model

## 1. Discovery Formula

$$\text{DISCOVERY\_ELIGIBLE} = \text{MARKETPLACE\_VISIBLE} \land \text{NOT\_SUSPENDED} \land \text{VALID\_SITE}$$

## 2. Fail-Closed Principles
1. **Unactivated Nodes**: `MARKETPLACE_VISIBLE = false` $\rightarrow$ Excluded from discovery listings and detail queries (`DISCOVERY_NOT_VISIBLE`).
2. **Suspended Nodes**: `status = 'SUSPENDED'` $\rightarrow$ Instantly excluded from public discovery (`PRINTHOUSE_SUSPENDED`).
3. **DB Failures**: Database connection or query errors fail closed (`DISCOVERY_FAILS_CLOSED: YES`).
