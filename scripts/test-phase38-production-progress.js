// scripts/test-phase38-production-progress.js
const fs = require('fs');
const path = require('path');

console.log('Running Phase 38.7 Production Progress Gate Static Tests...\n');

const serviceCode = fs.readFileSync(path.join(__dirname, '../src/api/services/marketplaceProductionProgressService.js'), 'utf-8');
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

// --- Service Exports (6 Assertions) ---
assertContains(serviceCode, "getProductionProgressStatus", "Service must export getProductionProgressStatus");
assertContains(serviceCode, "evaluateProductionProgressEligibility", "Service must export evaluateProductionProgressEligibility");
assertContains(serviceCode, "recordProductionProgress", "Service must export recordProductionProgress");
assertContains(serviceCode, "pauseProductionProgress", "Service must export pauseProductionProgress");
assertContains(serviceCode, "resumeProductionProgress", "Service must export resumeProductionProgress");
assertContains(serviceCode, "markProductionCompletionReady", "Service must export markProductionCompletionReady");

// --- Blockers & Warnings (15 Assertions) ---
assertContains(serviceCode, "PRODUCTION_CANCELLED", "Service must check for order status cancellation");
assertContains(serviceCode, "PRODUCTION_WORK_ORDER_CANCELLED", "Service must check for work order status cancellation");
assertContains(serviceCode, "INVALID_ORDER_STATUS_FOR_PROGRESS", "Service must validate order status for progress eligibility");
assertContains(serviceCode, "PRODUCTION_WORK_ORDER_MISSING", "Service must check if work order is missing");
assertContains(serviceCode, "PRODUCTION_WORK_ORDER_INVALID_PHASE", "Service must check if work order has invalid phase");
assertContains(serviceCode, "PRODUCTION_WORK_ORDER_MISSING_ID", "Service must check if work order is missing its ID");
assertContains(serviceCode, "PRODUCTION_WORK_ORDER_MISSING_MACHINE", "Service must check if work order is missing its machine ID");
assertContains(serviceCode, "PRODUCTION_WORK_ORDER_INVALID_STATUS", "Service must check if work order status is invalid");
assertContains(serviceCode, "PRODUCTION_DECISION_NOT_ACCEPTED", "Service must check if production decision is accepted");
assertContains(serviceCode, "PRODUCTION_QUEUE_NOT_ASSIGNED", "Service must check if order is assigned to a machine in queue");
assertContains(serviceCode, "INVOICE_MISSING", "Service must verify invoice presence");
assertContains(serviceCode, "PAYMENT_MISSING", "Service must verify payment presence");
assertContains(serviceCode, "PRODUCTION_NOT_UNLOCKED", "Service must check if production is unlocked");
assertContains(serviceCode, "DISPATCH_PACKAGE_NOT_FOUND", "Service must check if dispatch package is found");
assertContains(serviceCode, "FILE_ACCESS_NOT_VERIFIED_BY_AUDIT", "Service warning: file download completed event missing");

// --- Operations & Business Rules (9 Assertions) ---
assertContains(serviceCode, "INVALID_PROGRESS_PERCENT", "Service must check for invalid progress percent");
assertContains(serviceCode, "progressPercent > 99", "Service must restrict progress percent to a maximum of 99");
assertContains(serviceCode, "MILESTONE_REQUIRED", "Service must require a milestone name");
assertContains(serviceCode, "INVALID_MILESTONE", "Service must validate the milestone name");
assertContains(serviceCode, "CUSTOM_MILESTONE_LABEL_REQUIRED", "Service must require custom milestone label if milestone is CUSTOM");
assertContains(serviceCode, "PROGRESS_REGRESSION_BLOCKED", "Service must block regression unless forceRegression is set");
assertContains(serviceCode, "idempotent: true", "Service must support idempotency on duplicate operations");
assertContains(serviceCode, "completionTriggered: false", "Completion ready metadata must set completionTriggered to false");
assertContains(serviceCode, "COMPLETION_READY_PROGRESS_PERCENT_REQUIRED", "Completion ready must require at least 90% progress");

// --- Route Registrations & Feature Flag (2 Assertions) ---
assertContains(routesCode, "PPOS_ENABLE_PHASE38_PRODUCTION_PROGRESS", "Routes must be protected by production progress feature flag");
assertContains(routesCode, "PHASE38_PRODUCTION_PROGRESS_DISABLED", "Routes must return disabled error if feature flag is off");

// --- API Helpers (2 Assertions) ---
assertContains(apiCode, "export async function getProductionProgressStatus", "adminApi must export progress status function");
assertContains(apiCode, "export async function markProductionCompletionReady", "adminApi must export completion ready function");

// --- UI component (1 Assertion) ---
assertContains(uiCode, "Production Progress Gate", "UI must render the Production Progress Gate block");

console.log(`\n✅ Passed all ${assertionCount} static assertions successfully! 🚀`);
