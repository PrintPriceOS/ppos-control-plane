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
    console.log('\n━━━ Phase 107E — Admin Provider Settlement File API + UI Stubs Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsProviderSettlementFiles.js');
    assert(fs.existsSync(adminRoute), 'SC1: Route file exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-provider-settlement-files');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderSettlementFilesPage.tsx')), 'SC2: UI files exist');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsProviderSettlementFilesPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Provider settlement file readiness only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not process live settlement files'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Live provider files are not ingested'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Settlement reconciliation is review-only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Review links do not mutate source records'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payment'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute refund'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payout'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No external invoice submission is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No tax filing is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Prepared for provider settlement file readiness review only'), 'SC3: Required caution copy exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/runs/:settlementFileRunId/parse'), 'SC4: Parse action exists');
    assert(routeContent.includes('/runs/:settlementFileRunId/reconcile'), 'SC4: Reconcile action exists');
    assert(routeContent.includes('/runs/:settlementFileRunId/review'), 'SC4: Review action exists');
    assert(routeContent.includes('/runs/:settlementFileRunId/rows'), 'SC5: Rows endpoint exists');
    assert(routeContent.includes('/runs/:settlementFileRunId/matches'), 'SC5: Matches endpoint exists');
    assert(routeContent.includes('/runs/:settlementFileRunId/findings'), 'SC5: Findings endpoint exists');
    assert(routeContent.includes('/runs/:settlementFileRunId/audit'), 'SC5: Audit endpoint exists');

    assert(!routeContent.includes('executePayment') && !routeContent.includes('executeRefund'), 'SC6: No live retry/job/provider/payment/refund/payout/tax filing/external submission/FULL_PUBLIC activation exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 107E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
