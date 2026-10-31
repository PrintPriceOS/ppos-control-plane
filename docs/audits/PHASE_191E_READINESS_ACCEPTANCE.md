# Phase 191E: Onboarding Readiness status

## 1. Onboarding Checklist Milestones

In Phase 191E, the progressive onboarding checklist includes:
1. **Company Profile**: COMPLETE
2. **Production Sites**: COMPLETE
3. **Machinery Fleet**: COMPLETE
4. **Production Capabilities**: COMPLETE
5. **Materials**: COMPLETE (at least one material configured in catalog)
6. **Capacity**: COMPLETE (site capacity limits configured)
7. **Lead Times**: COMPLETE (site timezone and cutoff rules configured)

---

## 2. Incomplete State Invariant
Although individual modules (Materials, Capacity, Lead Times) are complete, the overall onboarding activation status remains locked to `IN_PROGRESS` because the remaining modules (Pricing, Shipping, Integrations, Marketplace Readiness) have not yet been implemented.

```text
MATERIALS_MODULE: COMPLETE
CAPACITY_MODULE: COMPLETE
LEAD_TIMES_MODULE: COMPLETE

PRICING_MODULE: NOT_IMPLEMENTED
OPERATIONAL_READINESS: IN_PROGRESS
PRODUCTION_ROUTING: DISABLED
MARKETPLACE_READINESS: NOT_AVAILABLE
```
No live production or job dispatch activation is enabled in this phase.
