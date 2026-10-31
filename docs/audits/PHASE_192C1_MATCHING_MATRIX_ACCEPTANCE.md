# Phase 192C.1: Matching Dimension Matrix Acceptance

## 1. Matrix Verification Results (`scripts/smoke_phase192c_marketplace_matching.js`)
- [x] **Visibility Dimension**: Active `MARKETPLACE_VISIBLE` nodes listed; hidden (`MARKETPLACE_VISIBLE = 0`) & suspended (`status = 'SUSPENDED'`) nodes excluded.
- [x] **Capability Dimension**: Process filtering (`OFFSET` vs `DIGITAL`). Node with `DIGITAL` matched only DIGITAL requirements.
- [x] **Format / Dimensions Dimension**: Format 500x700 matched; oversized format 1500x2000 rejected.
- [x] **Shipping Destination Dimension**: Destination `ES` matched with `SHIPPING_MATCH`.
- [x] **Deterministic Ranking**: Candidate scores ordered `DESC`, tie-broken by `printhouseId` `ASC`.
- [x] **Quote Eligibility Boundary**: Node with `MARKETPLACE_VISIBLE = true` and `LIVE_QUOTING_ALLOWED = false` is `DISCOVERABLE: TRUE` & `MATCH_ELIGIBLE: TRUE`, but `QUOTE_ELIGIBLE: FALSE`.
- [x] **Routing Boundary**: Matching does **NOT** require `JOB_ROUTING_ALLOWED` (enforced in Phase 192D).

## 2. Side-Effect DB Delta Proof
```text
ORDER_DELTA = 0
ROUTING_DELTA = 0
DISPATCH_DELTA = 0
PRODUCTION_JOB_DELTA = 0
ACTIVATION_GRANT_DELTA = 0
PRICING_SNAPSHOT_DELTA = 0
```
