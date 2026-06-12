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
    console.log('\n━━━ Phase 100E — Admin Production Activation Review API + UI Stubs Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsProductionActivationReview.js');
    assert(fs.existsSync(adminRoute), 'SC1: Route file exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-production-activation-review');

    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProductionActivationReviewPage.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProductionActivationReviewTable.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProductionActivationReviewFindingsPanel.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProductionActivationReviewGoNoGoPanel.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProductionActivationReviewEvidencePackPanel.tsx')), 'SC2: UI files exist');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsProductionActivationReviewPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Production activation readiness review only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not enable production'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('GO does not activate production'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payment'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute refund'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payout'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No external invoice submission is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No tax filing is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Live providers are not connected'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Prepared for controlled production activation review only'), 'SC3: Required caution copy exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/reviews/:activationReviewId/go-no-go'), 'SC4: Go/no-go endpoint exists');
    assert(routeContent.includes('/reviews/:activationReviewId/evidence-pack'), 'SC5: Evidence pack endpoint exists');
    assert(routeContent.includes('/reviews/:activationReviewId/checks'), 'SC6: Checks endpoint exists');
    assert(routeContent.includes('/reviews/:activationReviewId/findings'), 'SC6: Findings endpoint exists');
    assert(routeContent.includes('/reviews/:activationReviewId/audit'), 'SC6: Audit endpoint exists');
    assert(routeContent.includes('/reviews/:activationReviewId/export-preview'), 'SC6: Export preview endpoint exists');

    assert(!routeContent.includes('executePayment') && !routeContent.includes('executeRefund'), 'SC7: No real payment/refund/payout/tax filing/external submission/FULL_PUBLIC activation exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 100E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
