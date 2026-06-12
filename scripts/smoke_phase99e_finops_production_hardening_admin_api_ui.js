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
    console.log('\n━━━ Phase 99E — Admin Production Hardening API + UI Stubs Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsProductionHardening.js');
    assert(fs.existsSync(adminRoute), 'SC1: Route file exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-production-hardening');

    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProductionHardeningPage.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProductionHardeningRunTable.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProductionHardeningFindingsPanel.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProductionHardeningRollbackPanel.tsx')), 'SC2: UI files exist');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsProductionHardeningPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Production hardening readiness only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not enable production'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payment'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute refund'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payout'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No external invoice submission is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No tax filing is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Live providers are not connected'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Prepared for production readiness review only'), 'SC3: Required caution copy exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/runs/:hardeningRunId/evaluate'), 'SC4: Evaluate action exists');
    assert(routeContent.includes('/runs/:hardeningRunId/checks'), 'SC5: Checks endpoint exists');
    assert(routeContent.includes('/runs/:hardeningRunId/findings'), 'SC6: Findings endpoint exists');
    assert(routeContent.includes('/runs/:hardeningRunId/audit'), 'SC7: Audit endpoint exists');
    assert(routeContent.includes('/runs/:hardeningRunId/export-preview'), 'SC8: Export preview endpoint exists');

    assert(!routeContent.includes('executePayment') && !routeContent.includes('executeRefund'), 'SC9: No real payment/refund/payout/tax filing/external submission/FULL_PUBLIC activation exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 99E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
