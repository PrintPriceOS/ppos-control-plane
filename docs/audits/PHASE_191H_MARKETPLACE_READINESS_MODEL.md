# Phase 191H: Marketplace Readiness Model

## 1. Multi-Layer Readiness Derivation
Readiness is computed across 6 onboarding modules:
1. **Account Setup & Company Profile**: Legal name, contact info, primary site address.
2. **Machinery Fleet & Capabilities**: Active machines and verified production capabilities.
3. **Materials Catalog**: Configured stock paper/substrate entries.
4. **Site Capacity & Lead Times**: Production lead times, handling days, cutoff rules.
5. **Pricing Engine**: Validated & published price books with immutable triggers.
6. **Shipping & Delivery**: Tenant/site-scoped shipping regions, transit days, delivery methods.

## 2. Readiness Status Transition
```text
INCOMPLETE ──> READY_FOR_REVIEW ──> UNDER_REVIEW ──> APPROVED / CHANGES_REQUESTED
```
- A tenant moves to `READY_FOR_REVIEW` only when 0 blocking issues remain across all 6 modules.
- Readiness computation is **non-authorizing**: calculating readiness does not mutate database flags or grant production routing capabilities.
