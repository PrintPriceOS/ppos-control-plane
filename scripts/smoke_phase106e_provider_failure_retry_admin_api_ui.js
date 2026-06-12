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
    console.log('\n━━━ Phase 106E — Admin Provider Failure / Retry API + UI Stubs Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsProviderFailureRetry.js');
    assert(fs.existsSync(adminRoute), 'SC1: Route file exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-provider-failure-retry');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderFailureRetryPage.tsx')), 'SC2: UI files exist');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsProviderFailureRetryPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Provider failure/retry readiness only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute live retries'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not enqueue live jobs'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Circuit breaker state is simulated only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Dead-letter readiness does not process live jobs'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not connect live providers'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Live provider traffic is not accepted'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payment'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute refund'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payout'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No external invoice submission is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No tax filing is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Prepared for failure/retry readiness review only'), 'SC3: Required caution copy exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/runs/:failureRetryRunId/classify'), 'SC4: Classify actions exist');
    assert(routeContent.includes('/runs/:failureRetryRunId/simulate-retry'), 'SC4: Simulate-retry actions exist');
    assert(routeContent.includes('/runs/:failureRetryRunId/circuit-breaker-review'), 'SC4: Circuit-breaker actions exist');
    assert(routeContent.includes('/runs/:failureRetryRunId/attempts'), 'SC5: Attempts endpoints exist');
    assert(routeContent.includes('/runs/:failureRetryRunId/findings'), 'SC5: Findings endpoints exist');
    assert(routeContent.includes('/runs/:failureRetryRunId/audit'), 'SC5: Audit endpoints exist');

    assert(!routeContent.includes('executePayment') && !routeContent.includes('executeRefund'), 'SC6: No live retry/job/provider/payment/refund/payout/tax filing/external submission/FULL_PUBLIC activation exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 106E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
