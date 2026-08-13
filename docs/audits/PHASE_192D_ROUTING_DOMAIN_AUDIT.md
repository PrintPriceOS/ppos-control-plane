# Phase 192D: Order Routing Domain Audit Findings

## 1. Runtime Audit Responses

```text
IS_THERE_A_CANONICAL_ROUTING_SERVICE: YES (governedOrderRoutingService.js & routingEligibilityService.js)
IS_THERE_A_CANONICAL_ROUTING_DECISION_ENTITY: YES (order_routing_decisions)
DOES_ROUTING_CURRENTLY_REQUIRE_JOB_ROUTING_ALLOWED: YES (via printhouseActivationAdapter)
CAN_ROUTING_CURRENTLY_CREATE_PRODUCTION_JOBS: NO (Routing creates routing decisions only; dispatch deferred to 192E)
CAN_ROUTING_CURRENTLY_DISPATCH_TO_MACHINE: NO (Physical machine queue dispatch belongs to Phase 192E)
CAN_INDUSTRIAL_PROVISIONING_BYPASS_191H_GRANTS: NO (Remediated in Phase 192D: JOB_ROUTING_ALLOWED = 1 required)
IS_ROUTING_IDEMPOTENT: YES (governedOrderRoutingService.js enforces idempotency)
```

## 2. Legacy Remediation Verification
- **`industrialProvisioningService.js`**: `syncPrinterNodesToPrintNodes()` refactored to join `printhouse_activation_grants` and require `g.job_routing_allowed = 1 AND g.status = 'ACTIVE'`. Unactivated nodes without routing grants are excluded from industrial topology sync. Verified by `tests/industrial_provisioning_routing_remediation_test.js`.
