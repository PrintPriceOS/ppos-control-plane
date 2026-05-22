// scripts/test-phase38-production-queue.js
const fs = require('fs');
const path = require('path');

console.log('Running Phase 38.5 Production Queue / Machine Assignment Gate Tests...\n');

const serviceCode = fs.readFileSync(path.join(__dirname, '../src/api/services/marketplaceProductionQueueService.js'), 'utf-8');
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

// 1-5. Service exports required functions
assertContains(serviceCode, "evaluateProductionQueueEligibility", "Service must export evaluateProductionQueueEligibility");
assertContains(serviceCode, "createProductionQueueEntry", "Service must export createProductionQueueEntry");
assertContains(serviceCode, "getProductionQueueStatus", "Service must export getProductionQueueStatus");
assertContains(serviceCode, "assignProductionMachine", "Service must export assignProductionMachine");
assertContains(serviceCode, "unassignProductionMachine", "Service must export unassignProductionMachine");

// 6-11. Eligibility conditions
assertContains(serviceCode, "order.status !== 'PRODUCTION_ACCEPTED'", "Eligibility: must block if order status is not PRODUCTION_ACCEPTED");
assertContains(serviceCode, "dispatchPackage.status !== 'PRINTHOUSE_ACCEPTED'", "Eligibility: must block if dispatch package is not PRINTHOUSE_ACCEPTED");
assertContains(serviceCode, "invoice.status !== 'ISSUED'", "Eligibility: must check invoice ISSUED status");
assertContains(serviceCode, "payment.status !== 'PAYMENT_CONFIRMED'", "Eligibility: must check payment PAYMENT_CONFIRMED status");
assertContains(serviceCode, "productionUnlock.status !== 'PRODUCTION_UNLOCKED'", "Eligibility: must check production PRODUCTION_UNLOCKED status");
assertContains(serviceCode, "productionDecision.decision !== 'PRODUCTION_ACCEPTED'", "Eligibility: must check production decision PRODUCTION_ACCEPTED status");

// 12-13. Warnings
assertContains(serviceCode, "PRINTHOUSE_FILE_DOWNLOAD_COMPLETED", "Warnings: must check PRINTHOUSE_FILE_DOWNLOAD_COMPLETED in audit history");
assertContains(serviceCode, "MACHINE_REGISTRY_NOT_VERIFIED", "Warnings: must warn if machine is not in machine registry");

// 14-16. Idempotency checks
assertContains(serviceCode, "if ((order.status === 'PRODUCTION_QUEUED' || order.status === 'MACHINE_ASSIGNED') && metadata.production_queue)", "Idempotency: must check createProductionQueueEntry idempotency");
assertContains(serviceCode, "currentAssignment.machineId === machineId && currentAssignment.assignmentStatus === 'ASSIGNED'", "Idempotency: must check assignProductionMachine idempotency");
assertContains(serviceCode, "order.status === 'PRODUCTION_QUEUED' && currentAssignment.assignmentStatus === 'UNASSIGNED'", "Idempotency: must check unassignProductionMachine idempotency");

// 17-19. Audit events
assertContains(serviceCode, "type: 'PRODUCTION_QUEUE_ENTRY_CREATED'", "Audit: must emit PRODUCTION_QUEUE_ENTRY_CREATED event");
assertContains(serviceCode, "type: 'PRODUCTION_MACHINE_ASSIGNED'", "Audit: must emit PRODUCTION_MACHINE_ASSIGNED event");
assertContains(serviceCode, "type: 'PRODUCTION_MACHINE_UNASSIGNED'", "Audit: must emit PRODUCTION_MACHINE_UNASSIGNED event");

// 20. Feature flag route validation
assertContains(routesCode, "PPOS_ENABLE_PHASE38_PRODUCTION_QUEUE", "Routes: must check feature flag PPOS_ENABLE_PHASE38_PRODUCTION_QUEUE");
assertContains(routesCode, "PHASE38_PRODUCTION_QUEUE_DISABLED", "Routes: must return PHASE38_PRODUCTION_QUEUE_DISABLED error if disabled");

// 21. UI API helpers
assertContains(apiCode, "export async function getProductionQueueStatus", "API: must export getProductionQueueStatus helper");
assertContains(apiCode, "export async function evaluateProductionQueue", "API: must export evaluateProductionQueue helper");
assertContains(apiCode, "export async function createProductionQueueEntry", "API: must export createProductionQueueEntry helper");
assertContains(apiCode, "export async function assignProductionMachine", "API: must export assignProductionMachine helper");
assertContains(apiCode, "export async function unassignProductionMachine", "API: must export unassignProductionMachine helper");

// 22. UI Render section
assertContains(uiCode, "Production Queue Gate", "UI: must render the Production Queue Gate block");

// 23. UI Handlers
assertContains(uiCode, "handleCreateQueueEntry", "UI: must define handleCreateQueueEntry event handler");
assertContains(uiCode, "handleAssignMachine", "UI: must define handleAssignMachine event handler");
assertContains(uiCode, "handleUnassignMachine", "UI: must define handleUnassignMachine event handler");

console.log(`\n✅ Passed all ${assertionCount} static assertions successfully! 🚀`);
