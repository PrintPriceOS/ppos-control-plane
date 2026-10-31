# Phase 192D: Industrial Provisioning Remediation

## 1. Remediation Status
```text
INDUSTRIAL_PROVISIONING_ROUTING_BYPASS: REMEDIATED (Phase 192D)
INDUSTRIAL_PROVISIONING_DISPATCH_BYPASS: DEFERRED_TO_192E
```

## 2. Refactored Path Summary
`industrialProvisioningService.js` method `syncPrinterNodesToPrintNodes()` was updated to consume `activationAdapter.getCanonicalBulkFilterSql('g', 'JOB_ROUTING_ALLOWED')`.

Unactivated printer nodes or nodes missing `JOB_ROUTING_ALLOWED = 1` are excluded from industrial topology synchronization.

Verified by [tests/industrial_provisioning_routing_remediation_test.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/industrial_provisioning_routing_remediation_test.js).
