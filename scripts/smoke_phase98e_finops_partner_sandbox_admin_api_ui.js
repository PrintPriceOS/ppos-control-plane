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
    console.log('\n━━━ Phase 98E — Admin Partner Sandbox API + UI Stubs Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsPartnerSandbox.js');
    assert(fs.existsSync(adminRoute), 'SC1: Route file exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-partner-sandbox');

    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsPartnerSandboxPage.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsPartnerSandboxTable.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsPartnerSandboxRunTable.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsPartnerSandboxMockProviderPanel.tsx')), 'SC2: UI files exist');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsPartnerSandboxPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Partner sandbox only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Sandbox is not live financial execution'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Mock provider only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Dry-run only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payment'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute refund'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payout'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No external invoice submission is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No tax filing is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Simulated partner integration readiness only'), 'SC3: Required caution copy exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/sandboxes/:sandboxId/activate'), 'SC4: Sandbox actions exist');
    assert(routeContent.includes('/sessions/:sandboxSessionId/revoke'), 'SC5: Session actions exist');
    assert(routeContent.includes('/runs/:sandboxRunId/mock-provider'), 'SC6: Mock provider actions exist');
    assert(routeContent.includes('/runs/:sandboxRunId/dry-run'), 'SC7: Dry-run actions exist');
    assert(routeContent.includes('/runs/:sandboxRunId/audit'), 'SC8: Audit endpoint exists');

    assert(!routeContent.includes('executePayment') && !routeContent.includes('executeRefund'), 'SC9: No real payment/refund/payout/tax filing/external submission/FULL_PUBLIC activation exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 98E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
