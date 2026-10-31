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
    console.log('\n━━━ Phase 102E — Admin Provider Contract / SLA API + UI Stubs Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsProviderContractSla.js');
    assert(fs.existsSync(adminRoute), 'SC1: Route file exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-provider-contract-sla');

    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderContractSlaPage.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderContractTable.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderSlaTable.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderContractReviewPanel.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderSlaReviewPanel.tsx')), 'SC2: UI files exist');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsProviderContractSlaPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Provider contract/SLA readiness only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Approval does not activate provider connectivity'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not connect live providers'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Live credentials are not used'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payment'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute refund'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payout'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No external invoice submission is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No tax filing is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Prepared for provider contract/SLA review only'), 'SC3: Required caution copy exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/contracts/:providerContractId/approve'), 'SC4: Contract actions exist');
    assert(routeContent.includes('/slas/:providerSlaId/approve'), 'SC5: SLA actions exist');
    assert(routeContent.includes('/contracts/:providerContractId/checks'), 'SC6: Checks endpoint exists');
    assert(routeContent.includes('/audit'), 'SC7: Audit endpoint exists');

    assert(!routeContent.includes('executePayment') && !routeContent.includes('executeRefund'), 'SC8: No real execution exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 102E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
