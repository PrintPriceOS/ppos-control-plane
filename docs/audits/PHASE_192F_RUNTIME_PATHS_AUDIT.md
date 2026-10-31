# PHASE_192F_RUNTIME_PATHS_AUDIT.md

## Phase 192F — Runtime Capability Paths Kill Switch Coverage Audit

### Audit Date
2026-08-13

---

## Objective

Prove that `RUNTIME_PATHS_BYPASSING_KILL_SWITCH_GOVERNANCE: 0`

---

## Governed Path Inventory

All runtime capability decisions flow through `printhouseActivationAdapter.js`:

| Consumer Path | Method Called | Kill Switch Evaluated |
|---------------|--------------|----------------------|
| `liveQuoteEligibilityService.js` | `adapter.hasCapability(LIVE_QUOTING_ALLOWED)` | YES — via `getCapabilities()` |
| `marketplaceDiscoveryService.js` | `adapter.getEligibleTenantIds(MARKETPLACE_VISIBLE)` | YES — via bulk filter + adapter |
| `jobRoutingService.js` | `adapter.requireCapability(JOB_ROUTING_ALLOWED)` | YES — explicit ksCheck in `requireCapability()` |
| `governedProductionDispatchService.js` | `adapter.requireCapability(PRODUCTION_DISPATCH_ALLOWED)` | YES — explicit ksCheck in `requireCapability()` |
| `printerSyncService.js` | `adapter.requireCapability(PRODUCTION_DISPATCH_ALLOWED)` | YES — via `requireCapability()` |

---

## Legacy Bypass Status (from Phase 192A)

| Legacy File | Bypass Risk | Status |
|-------------|-------------|--------|
| `industrialProvisioningService.js` | HIGH | REMEDIATED (192D/192E) |
| `printerSyncService.js` | MEDIUM | REMEDIATED (192E) |
| `networkOpsService.js` | LOW | READ-ONLY, INFORMATIONAL ONLY |

---

## Kill Switch Path Coverage

| Capability | Kill Switch Scope Tested | Path Blocked |
|-----------|--------------------------|-------------|
| MARKETPLACE_VISIBLE | GLOBAL | YES (smoke test) |
| LIVE_QUOTING_ALLOWED | GLOBAL + TENANT | YES (effectiveness test) |
| JOB_ROUTING_ALLOWED | GLOBAL + TENANT | YES (effectiveness test) |
| PRODUCTION_DISPATCH_ALLOWED | GLOBAL + TENANT | YES (effectiveness test + recovery test) |

---

## RUNTIME_PATHS_BYPASSING_KILL_SWITCH_GOVERNANCE: 0
## UNKNOWN_RUNTIME_PATHS: 0
