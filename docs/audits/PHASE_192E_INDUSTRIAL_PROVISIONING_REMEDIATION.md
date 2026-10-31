# Phase 192E: Industrial Provisioning Dispatch Remediation

## 1. Remediation Status
```text
INDUSTRIAL_PROVISIONING_ROUTING_BYPASS: REMEDIATED (Phase 192D)
INDUSTRIAL_PROVISIONING_DISPATCH_BYPASS: REMEDIATED (Phase 192E)
```

## 2. Refactored Path Summary
`industrialProvisioningService.js` method `seedPricingProfiles()` was updated to consume `activationAdapter.getCanonicalBulkFilterSql('g', 'PRODUCTION_DISPATCH_ALLOWED')`.

Unactivated printer nodes or nodes missing `PRODUCTION_DISPATCH_ALLOWED = 1` are excluded from pricing profile dispatch seeding.

Verified by [tests/industrial_provisioning_dispatch_remediation_test.js](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/tests/industrial_provisioning_dispatch_remediation_test.js).
