# Phase 192C: Discovery Domain Audit Findings

## 1. Runtime Audit Responses

```text
IS_THERE_A_CANONICAL_DISCOVERY_SERVICE: YES (marketplaceDiscoveryService.js)
IS_THERE_A_CANONICAL_MATCHING_SERVICE: YES (marketplaceMatchingService.js)
DOES_DISCOVERY_CURRENTLY_CHECK_MARKETPLACE_VISIBLE: YES (g.marketplace_visible = 1 AND g.status = 'ACTIVE')
DOES_MATCHING_CURRENTLY_CHECK_MARKETPLACE_VISIBLE: YES (Starts strictly from discoverable nodes)
DOES_MATCHING_CURRENTLY_USE_ROUTING_ELIGIBILITY: NO (Independent; JOB_ROUTING_ALLOWED evaluated in Phase 192D)
DOES_MATCHING_MUTATE_RUNTIME_STATE: NO (In-memory matching; zero side-effect DB deltas)
```

## 2. Legacy Remediation Verification
- **`networkOpsService.js`**: Refactored `getNetworkOverview` queries to join `printhouse_activation_grants` and require `g.marketplace_visible = 1 AND g.status = 'ACTIVE'`. Non-visible onboarding print nodes are strictly excluded from marketplace capacity metrics.
