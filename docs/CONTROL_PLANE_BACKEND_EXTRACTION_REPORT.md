# CONTROL_PLANE_BACKEND_EXTRACTION_REPORT.md

## Extraction Summary

- **Phase:** 4 — Backend Extraction
- **Status:** COMPLETED (Safe Copy)
- **Source:** `extraction_admin_monolito/`
- **Target Repository:** `ppos-control-plane`

## Extracted Routes

The following Express-based routers have been copied to `src/api/routes/`:

- `admin.js` (Root Admin Router)
- `adminControl.js` (System Controls)
- `connectAdmin.js` (Printer Network)
- `routingAdmin.js` (Intelligent Routing)
- `marketplaceAdmin.js` (Federated Marketplace)
- `economicRoutingAdmin.js`
- `pricingAdmin.js`
- `offersAdmin.js`
- `negotiationAdmin.js`
- `commercialCommitmentAdmin.js`
- `autonomyAdmin.js`
- `autonomyFinanceAdmin.js`

## Middleware & Services

### Middleware
- `src/api/middleware/auth.js` (Extracted from `requireAdmin.js`)

### Services
- `auditService.js`
- `networkOpsService.js`
- `autonomousOrchestrator.js`
- `commercialCommitmentService.js`
- `connectService.js`
- `csWorkflowService.js`
- `economicRoutingService.js`
- `engagementEngine.js`
- `financialLedgerService.js`
- `marketplaceReadinessService.js`
- `marketplaceService.js`
- `notificationRegistry.js`
- `payoutService.js`
- `pricingIntelligenceService.js`
- `productionSignalService.js`
- `reportService.js`

## Unresolved Dependencies

| Dependency | Category | Status | Note |
| :--- | :--- | :--- | :--- |
| `db.js` | Infrastructure | **STUBBED** | Many services rely on local `db.js`. Must be re-mapped to `@ppos/shared-infra`. |
| `queue.js` | Infrastructure | **STUBBED** | `adminControl` relies on BullMQ instance. Needs adapter. |
| `express` | Framework | **INCOMPATIBLE**| Target repo uses Fastify. Routes are currently in Express format. |
| `dotenv` | Config | **REQUIRED** | Environment variables must be shared. |

## Required Adapters (Phase 5)

1. **Database Adapter**: Bridge to Shared Infra DB.
2. **Queue Adapter**: Proxy for background job management.
3. **Audit Adapter**: Porting `auditService.js` to a common standard.
4. **Fastify-Express Bridge**: Required if we want to run Express routers inside Fastify, or full manual rewrite.
