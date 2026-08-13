# Phase 192C.1: Capability Access Inventory & Governance Centralization

## 1. Access Model Classification
```text
DISCOVERY_GRANT_ACCESS_MODEL: CANONICAL_SET_BASED_GRANT_QUERY
CANONICAL_ADAPTER_HELPER: activationAdapter.getCanonicalBulkFilterSql(grantTableAlias, capability)
UNKNOWN_CAPABILITY_ACCESS_PATHS: 0
DISCOVERY_PATHS_BYPASSING_CAPABILITY_GOVERNANCE: 0
SUSPENSION_SEMANTICS: CENTRALIZED
```

## 2. Centralized Adapter Helpers (`src/api/services/printhouseActivationAdapter.js`)
1. **`getEligibleTenantIds({ capability })`**: Returns Array of tenant IDs holding an active grant for the specified capability.
2. **`getCanonicalBulkFilterSql(grantTableAlias, capability)`**: Generates canonical SQL filter string (e.g. `g.marketplace_visible = 1 AND g.status = 'ACTIVE'`).

## 3. Inventory of Discovery & Matching Paths

| Service / Route Path | Access Mechanism | Centralized Adapter Helper Used? | Side Effects |
| :--- | :--- | :--- | :--- |
| `marketplaceDiscoveryService.js` | `CANONICAL_BULK_FILTER` | YES (`activationAdapter.getCanonicalBulkFilterSql('g', 'MARKETPLACE_VISIBLE')`) | ZERO |
| `marketplaceMatchingService.js` | `CANONICAL_ADAPTER` | YES (`discoveryService.listDiscoverableNodes()`) | ZERO |
| `networkOpsService.js` | `CANONICAL_BULK_FILTER` | YES (`activationAdapter.getCanonicalBulkFilterSql('g', 'MARKETPLACE_VISIBLE')`) | ZERO |
| `GET /api/marketplace/printhouses` | `CANONICAL_ADAPTER` | YES (`discoveryService.listDiscoverableNodes()`) | ZERO |
| `GET /api/marketplace/printhouses/:id` | `CANONICAL_ADAPTER` | YES (`activationAdapter.getCapabilities()`) | ZERO |
| `POST /api/marketplace/match` | `CANONICAL_ADAPTER` | YES (`matchingService.matchCandidates()`) | ZERO |
