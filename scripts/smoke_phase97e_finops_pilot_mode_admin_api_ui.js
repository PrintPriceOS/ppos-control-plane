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
    console.log('\n━━━ Phase 97E — Admin Pilot Mode API + UI Stubs Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsPilotMode.js');
    assert(fs.existsSync(adminRoute), 'SC1: Route file exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-pilot-mode');

    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsPilotModePage.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsPilotProgramTable.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsPilotRunTable.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsPilotDryRunPanel.tsx')), 'SC2: UI files exist');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsPilotModePage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Controlled pilot mode only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Pilot mode is not live financial execution'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Dry-run only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payment'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute refund'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payout'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No external invoice submission is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No tax filing is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Supervised pilot eligibility only'), 'SC3: Required caution copy exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/programs/:pilotProgramId/activate'), 'SC4: Program actions exist');
    assert(routeContent.includes('/programs/:pilotProgramId/suspend'), 'SC4: Program actions exist');
    assert(routeContent.includes('/runs/:pilotRunId/dry-run'), 'SC5: Dry-run actions exist');
    assert(routeContent.includes('/runs/:pilotRunId/monitoring'), 'SC6: Monitoring endpoint exists');
    assert(routeContent.includes('/runs/:pilotRunId/audit'), 'SC7: Audit endpoint exists');

    assert(!routeContent.includes('executePayment') && !routeContent.includes('executeRefund'), 'SC8: No real payment/refund/payout/tax filing/external submission/FULL_PUBLIC activation exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 97E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
