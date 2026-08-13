# Phase 192E: Production Dispatch & Telemetry Domain Audit Findings

## 1. Runtime Audit Responses

```text
IS_THERE_A_CANONICAL_DISPATCH_SERVICE: YES (governedProductionDispatchService.js & dispatchEligibilityService.js)
IS_THERE_A_CANONICAL_PRODUCTION_JOB_ENTITY: YES (production_jobs)
IS_THERE_A_CANONICAL_MACHINE_QUEUE: YES (printer_queue / machine_queue)
DOES_DISPATCH_CURRENTLY_REQUIRE_PRODUCTION_DISPATCH_ALLOWED: YES (via printhouseActivationAdapter)
CAN_PRINTER_SYNC_BYPASS_191H_GRANTS: NO (Remediated in Phase 192E: PRODUCTION_DISPATCH_ALLOWED & job binding required)
CAN_INDUSTRIAL_PROVISIONING_DISPATCH_BYPASS_191H_GRANTS: NO (Remediated in Phase 192E: PRODUCTION_DISPATCH_ALLOWED required)
IS_TELEMETRY_AUTHENTICATION_SEPARATE_FROM_DISPATCH_AUTHORIZATION: YES (Authentication validates API key hash; authorization requires PRODUCTION_DISPATCH_ALLOWED grant and job binding)
```

## 2. Legacy Remediation Verification
- **`industrialProvisioningService.js`**: `seedPricingProfiles()` refactored to require `g.production_dispatch_allowed = 1 AND g.status = 'ACTIVE'`. Verified by `tests/industrial_provisioning_dispatch_remediation_test.js`.
- **`printerSyncService.js`**: `updateJobStatus()` requires `PRODUCTION_DISPATCH_ALLOWED` grant and enforces job-to-tenant binding (`TELEMETRY_JOB_NOT_ASSIGNED`). Verified by `tests/printer_sync_capability_remediation_test.js`.
