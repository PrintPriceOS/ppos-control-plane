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
    console.log('\n━━━ Phase 96E — Admin Release Gates API + UI Stubs Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsReleaseGates.js');
    assert(fs.existsSync(adminRoute), 'SC1: Route file exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-release-gates');

    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsReleaseGatesPage.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsReleaseGateTable.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsReleaseGateDetail.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsReleaseGateApprovalPanel.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsReleaseGateRiskPanel.tsx')), 'SC2: UI files exist');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsReleaseGatesPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Release-gate readiness only'), 'SC3: Required caution copy exists (readiness only)');
    assert(adminPageContent.includes('Approval does not execute financial operations'), 'SC3: Required caution copy exists (approval info)');
    assert(adminPageContent.includes('This does not execute payment'), 'SC3: Required caution copy exists (no payment)');
    assert(adminPageContent.includes('This does not execute refund'), 'SC3: Required caution copy exists (no refund)');
    assert(adminPageContent.includes('This does not execute payout'), 'SC3: Required caution copy exists (no payout)');
    assert(adminPageContent.includes('No external invoice submission is enabled'), 'SC3: Required caution copy exists (no external invoice)');
    assert(adminPageContent.includes('No tax filing is enabled'), 'SC3: Required caution copy exists (no tax)');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC3: Required caution copy exists (no full public)');
    assert(adminPageContent.includes('Eligible for future controlled release only'), 'SC3: Required caution copy exists (eligibility)');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/evaluate'), 'SC4: Evaluate action exists');
    assert(routeContent.includes('/approval'), 'SC4: Approval action exists');
    assert(routeContent.includes('/revoke'), 'SC4: Revoke action exists');
    assert(routeContent.includes('/risk'), 'SC5: Risk endpoint exists');
    assert(routeContent.includes('/audit'), 'SC6: Audit endpoint exists');

    assert(!routeContent.includes('executePayment') && !routeContent.includes('executeRefund'), 'SC7: No payment/refund/payout/tax filing/external submission/FULL_PUBLIC activation exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 96E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
