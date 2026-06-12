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
    console.log('\n━━━ Phase 95E — Admin FinOps API + UI Stubs Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsReadiness.js');
    assert(fs.existsSync(adminRoute), 'SC1: Backend route exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-readiness');

    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsReadinessPage.tsx')), 'SC2: FinancialOperationsReadinessPage exists');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsRunTable.tsx')), 'SC3: FinancialOperationsRunTable exists');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsChecklistPanel.tsx')), 'SC4: FinancialOperationsChecklistPanel exists');

    assert(fs.existsSync(path.join(ROOT, 'src/ui/api/financialOperationsReadinessClient.ts')), 'SC5: API client exists');
    assert(fs.existsSync(path.join(ROOT, 'src/ui/types/financialOperationsReadiness.ts')), 'SC6: Types file exists');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsReadinessPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Financial operations readiness only'), 'SC7: Required caution copy exists (readiness only)');
    assert(adminPageContent.includes('Manual review required'), 'SC8: Required caution copy exists (manual)');
    assert(adminPageContent.includes('does not execute payment'), 'SC9: Required caution copy exists (no payment)');
    assert(adminPageContent.includes('does not execute refund'), 'SC10: Required caution copy exists (no refund)');
    assert(adminPageContent.includes('does not execute payout'), 'SC11: Required caution copy exists (no payout)');
    assert(adminPageContent.includes('No external invoice submission is enabled'), 'SC12: Required caution copy exists (no external invoice)');
    assert(adminPageContent.includes('No tax filing is enabled'), 'SC13: Required caution copy exists (no tax)');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC14: Required caution copy exists (no full public)');
    assert(adminPageContent.includes('Prepared for finance/accounting review'), 'SC15: Required caution copy exists (prepared for accounting)');

    assert(!adminPageContent.includes('executePayment') && !adminPageContent.includes('submitExternal'), 'SC16: No payment/refund/payout/tax filing/external submission integration exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/runs/:readinessRunId/review'), 'SC17: Manual review actions exist');
    assert(routeContent.includes('/runs/:readinessRunId/checklist'), 'SC18: Checklist endpoint exists');
    assert(routeContent.includes('/runs/:readinessRunId/audit'), 'SC19: Audit endpoint exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 95E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
