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
    console.log('\n━━━ Phase 101E — Admin Provider Connectivity Sandbox API + UI Stubs Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsProviderSandbox.js');
    assert(fs.existsSync(adminRoute), 'SC1: Route file exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-provider-sandbox');

    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderSandboxPage.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderSandboxTable.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderMockAdapterPanel.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderStubAdapterPanel.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderCredentialGuardrailPanel.tsx')), 'SC2: UI files exist');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsProviderSandboxPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Provider connectivity sandbox readiness only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not connect live providers'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Live credentials are not used'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Mock/stub provider only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Dry-run only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payment'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute refund'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payout'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No external invoice submission is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No tax filing is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Prepared for provider sandbox review only'), 'SC3: Required caution copy exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/providers/:providerSandboxId/activate'), 'SC4: Provider sandbox actions exist');
    assert(routeContent.includes('/tests/:connectionTestId/mock'), 'SC5: Mock/stub/dry-run test actions exist');
    assert(routeContent.includes('/tests/:connectionTestId/guardrails'), 'SC6: Guardrail endpoint exists');
    assert(routeContent.includes('/tests/:connectionTestId/audit'), 'SC7: Audit endpoint exists');

    assert(!routeContent.includes('executePayment') && !routeContent.includes('executeRefund'), 'SC8: No real payment/refund/payout/tax filing/external submission/FULL_PUBLIC activation/live provider connectivity exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 101E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
