// scripts/test-phase38-work-order-execution.js
const fs = require('fs');
const path = require('path');

console.log('Running Phase 38.6 Production Start / Work Order Execution Gate Tests...\n');

const serviceCode = fs.readFileSync(path.join(__dirname, '../src/api/services/marketplaceProductionWorkOrderService.js'), 'utf-8');
const routesCode = fs.readFileSync(path.join(__dirname, '../src/api/routes/adminMarketplaceOrders.js'), 'utf-8');
const apiCode = fs.readFileSync(path.join(__dirname, '../src/ui/lib/adminApi.ts'), 'utf-8');
const uiCode = fs.readFileSync(path.join(__dirname, '../src/ui/pages/admin/MarketplacePrinthouseHandoffTab.tsx'), 'utf-8');

let assertionCount = 0;

function assertContains(content, str, msg) {
    assertionCount++;
    if (!content.includes(str)) {
        throw new Error(`Assertion #${assertionCount} failed: ${msg}\nMissing string: ${str}`);
    }
}

// --- Service Exports (7 Assertions) ---
// 1. evaluateWorkOrderEligibility
assertContains(serviceCode, "evaluateWorkOrderEligibility", "Service must export evaluateWorkOrderEligibility");
// 2. createProductionWorkOrder
assertContains(serviceCode, "createProductionWorkOrder", "Service must export createProductionWorkOrder");
// 3. getProductionWorkOrderStatus
assertContains(serviceCode, "getProductionWorkOrderStatus", "Service must export getProductionWorkOrderStatus");
// 4. startProductionWorkOrder
assertContains(serviceCode, "startProductionWorkOrder", "Service must export startProductionWorkOrder");
// 5. pauseProductionWorkOrder
assertContains(serviceCode, "pauseProductionWorkOrder", "Service must export pauseProductionWorkOrder");
// 6. resumeProductionWorkOrder
assertContains(serviceCode, "resumeProductionWorkOrder", "Service must export resumeProductionWorkOrder");
// 7. cancelProductionWorkOrder
assertContains(serviceCode, "cancelProductionWorkOrder", "Service must export cancelProductionWorkOrder");

// --- Blockers & Warnings (11 Assertions) ---
// 8. Blocker: PRODUCTION_WORK_ORDER_CANCELLED
assertContains(serviceCode, "PRODUCTION_WORK_ORDER_CANCELLED", "Service must check and block if work order is already cancelled");
// 9. Blocker: INVALID_ORDER_STATUS_FOR_WORK_ORDER
assertContains(serviceCode, "INVALID_ORDER_STATUS_FOR_WORK_ORDER", "Service must check for invalid order status");
// 10. Blocker: HANDOFF_PACKAGE_NOT_FOUND
assertContains(serviceCode, "HANDOFF_PACKAGE_NOT_FOUND", "Service must check for dispatch package existence");
// 11. Blocker: DISPATCH_PACKAGE_NOT_ACCEPTED
assertContains(serviceCode, "DISPATCH_PACKAGE_NOT_ACCEPTED", "Service must check if dispatch package status is PRINTHOUSE_ACCEPTED");
// 12. Blocker: INVOICE_NOT_ISSUED
assertContains(serviceCode, "INVOICE_NOT_ISSUED", "Service must check invoice status is ISSUED");
// 13. Blocker: PAYMENT_NOT_CONFIRMED
assertContains(serviceCode, "PAYMENT_NOT_CONFIRMED", "Service must check payment status is PAYMENT_CONFIRMED");
// 14. Blocker: PRODUCTION_NOT_UNLOCKED
assertContains(serviceCode, "PRODUCTION_NOT_UNLOCKED", "Service must check production unlock status is PRODUCTION_UNLOCKED");
// 15. Blocker: PRODUCTION_DECISION_NOT_ACCEPTED
assertContains(serviceCode, "PRODUCTION_DECISION_NOT_ACCEPTED", "Service must check production decision is PRODUCTION_ACCEPTED");
// 16. Blocker: PRODUCTION_QUEUE_NOT_ASSIGNED
assertContains(serviceCode, "PRODUCTION_QUEUE_NOT_ASSIGNED", "Service must check production queue is assigned");
// 17. Warning: FILE_ACCESS_NOT_VERIFIED_BY_AUDIT
assertContains(serviceCode, "FILE_ACCESS_NOT_VERIFIED_BY_AUDIT", "Service must check for file download audit completion event");
// 18. Warning: MACHINE_REGISTRY_NOT_VERIFIED
assertContains(serviceCode, "MACHINE_REGISTRY_NOT_VERIFIED", "Service must verify machine node status in registry");

// --- Idempotency (5 Assertions) ---
// 19. Idempotency on Create
assertContains(serviceCode, "idempotent: true", "Service must support idempotent operations");
assertContains(serviceCode, "['WORK_ORDER_CREATED', 'PRODUCTION_STARTED', 'PRODUCTION_PAUSED'].includes(order.status)", "Service must return idempotent: true on double create");
// 20. Idempotency on Start
assertContains(serviceCode, "order.status === 'PRODUCTION_STARTED' && metadata.production_work_order.status === 'PRODUCTION_STARTED'", "Service must handle idempotent start");
// 21. Idempotency on Pause
assertContains(serviceCode, "order.status === 'PRODUCTION_PAUSED' && metadata.production_work_order.status === 'PRODUCTION_PAUSED'", "Service must handle idempotent pause");
// 22. Idempotency on Resume
assertContains(serviceCode, "order.status === 'PRODUCTION_STARTED' && metadata.production_work_order.status === 'PRODUCTION_STARTED'", "Service must handle idempotent resume");
// 23. Idempotency on Cancel
assertContains(serviceCode, "order.status === 'PRODUCTION_CANCELLED'", "Service must handle idempotent cancel");

// --- Cancellation Boundaries & Metadata (3 Assertions) ---
// 24. commercialImpact: 'NONE'
assertContains(serviceCode, "commercialImpact: 'NONE'", "Cancellation metadata must set commercialImpact to NONE");
// 25. refundTriggered: false
assertContains(serviceCode, "refundTriggered: false", "Cancellation metadata must set refundTriggered to false");
// 26. invoiceCancelled: false
assertContains(serviceCode, "invoiceCancelled: false", "Cancellation metadata must set invoiceCancelled to false");

// --- Routes & Feature Flags (4 Assertions) ---
// 27. Feature flag checks in routes
assertContains(routesCode, "PPOS_ENABLE_PHASE38_WORK_ORDER_EXECUTION", "Routes must use process.env feature flag guard");
// 28. Error code when flag is disabled
assertContains(routesCode, "PHASE38_WORK_ORDER_EXECUTION_DISABLED", "Routes must return PHASE38_WORK_ORDER_EXECUTION_DISABLED error");
// 29. Endpoints register GET /status
assertContains(routesCode, "/:id/production-work-order/status", "Routes must register status GET endpoint");
// 30. Endpoints register POST /evaluate
assertContains(routesCode, "/:id/production-work-order/evaluate", "Routes must register evaluate POST endpoint");

// --- Frontend API Helpers (2 Assertions) ---
// 31. adminApi.ts exports
assertContains(apiCode, "export async function getProductionWorkOrderStatus", "adminApi must export getProductionWorkOrderStatus helper");
assertContains(apiCode, "export async function cancelProductionWorkOrder", "adminApi must export cancelProductionWorkOrder helper");

// --- UI Component & Event Handlers (2 Assertions) ---
// 33. Title or Section Header in UI
assertContains(uiCode, "Work Order Execution Gate", "UI must render the Work Order Execution Gate header");
// 34. Handler callbacks inside UI
assertContains(uiCode, "handleCreateWorkOrder", "UI must define handleCreateWorkOrder handler");

console.log(`\n✅ Passed all ${assertionCount} static assertions successfully! 🚀`);
