'use strict';

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}`);
    }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 105E — Admin Provider Event Reconciliation API + UI Stubs Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsProviderEventReconciliation.js');
    assert(fs.existsSync(adminRoute), 'SC1: Route file exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-provider-event-reconciliation');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderEventReconciliationPage.tsx')), 'SC2: UI files exist');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsProviderEventReconciliationPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Provider event reconciliation readiness only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not process live provider events'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Live provider traffic is not accepted'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Live signing secrets are not used'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Reconciliation is review-only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Review links do not mutate source records'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payment'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute refund'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payout'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No external invoice submission is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No tax filing is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Prepared for provider event reconciliation review only'), 'SC3: Required caution copy exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/runs/:eventReconciliationRunId/normalize'), 'SC4: Normalize actions exist');
    assert(routeContent.includes('/runs/:eventReconciliationRunId/reconcile'), 'SC4: Reconcile actions exist');
    assert(routeContent.includes('/runs/:eventReconciliationRunId/review'), 'SC4: Review actions exist');
    assert(routeContent.includes('/runs/:eventReconciliationRunId/events'), 'SC5: Events endpoints exist');
    assert(routeContent.includes('/runs/:eventReconciliationRunId/matches'), 'SC5: Matches endpoints exist');
    assert(routeContent.includes('/runs/:eventReconciliationRunId/findings'), 'SC5: Findings endpoints exist');
    assert(routeContent.includes('/runs/:eventReconciliationRunId/audit'), 'SC5: Audit endpoints exist');

    assert(!routeContent.includes('executePayment') && !routeContent.includes('executeRefund'), 'SC6: No live event processing/webhook endpoint/signing secret use');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 105E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
