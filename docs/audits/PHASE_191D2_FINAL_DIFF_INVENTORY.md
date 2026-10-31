# PHASE_191D2_FINAL_DIFF_INVENTORY.md

## Repository Identity
* **Remote**: `https://github.com/PrintPriceOS/ppos-control-plane.git`
* **Branch**: `phase-39.2-tenant-management-console`
* **Commit SHA**: `aefbdf8acbc72d7bb81dd3ca22013e784d23a0b6`

---

## Classified File Inventory

| File | Classification | Description / Rationale | Remaining Modified? |
| --- | --- | --- | --- |
| `migrations/migration-integrity-baseline.json` | MIGRATION_CHANGE | Regenerated baseline metadata to include newly added migrations. | **Yes** |
| `server.js` | PRODUCT_CHANGE | Mounted machines routes; bridged Fastify `request.user` to Express `request.raw.user`. | **Yes** |
| `src/api/routes/printhouseMachinesRoutes.js` | PRODUCT_CHANGE | Mounted REST endpoint handlers for machines and capability summary. | **Yes** |
| `src/api/services/printhouseMachineService.js` | PRODUCT_CHANGE | Added validation, templates, and strict `FIELD_NOT_EDITABLE` validation. | **Yes** |
| `src/api/services/printhouseCapabilityOnboardingService.js` | PRODUCT_CHANGE | Computed derived capability models from non-archived equipment. | **Yes** |
| `src/api/services/printhouseReadinessService.js` | PRODUCT_CHANGE | Added machine and capability count checks to operational readiness computation. | **Yes** |
| `src/ui/pages/printhouse/PrinthouseSetupHub.tsx` | PRODUCT_CHANGE | Integrated Machinery Fleet and Capabilities tabs based on site presence. | **Yes** |
| `src/ui/components/printhouse/setup/MachineFleetPanel.tsx` | PRODUCT_CHANGE | Developed machinery CRUD management layout. | **Yes** |
| `src/ui/components/printhouse/setup/CapabilitiesPanel.tsx` | PRODUCT_CHANGE | Developed capability provenance summary list view. | **Yes** |
| `scripts/init_test_db.js` | TEST_INFRASTRUCTURE | Hardened test initializer environment locks and local loopback guards. | **Yes** |
| `scripts/verify_db_isolation.js` | TEST_INFRASTRUCTURE | Programmatic test verifying database-level constraint violations. | **Yes** |
| `test/integration/smoke_phase191d2_http_routes.js` | TEST_INFRASTRUCTURE | Comprehensive route authentication and multi-tenant HTTP test. | **Yes** |
| `scripts/smoke_phase191d1_machines_capabilities.js` | TEST_INFRASTRUCTURE | Updated service level smoke assertions to check `FIELD_NOT_EDITABLE` errors. | **Yes** |

---

## Critical Infrastructure Status Check

As required by Section 1:

```text
src/api/services/migrationService.js                                    UNMODIFIED
src/api/services/sqlParser.js                                           UNMODIFIED / ABSENT
migrations/092_phase144_governed_high_risk_cohort_intervention_approval_gate.sql UNMODIFIED
scripts/clean_schema_versions.js                                        UNMODIFIED
scripts/regen_baseline.js                                               UNMODIFIED
```
