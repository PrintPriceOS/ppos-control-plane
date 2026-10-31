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
    console.log('\n━━━ Phase 94E — Admin Invoice/Credit Note API + UI Stubs Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminGovernedInvoices.js');
    assert(fs.existsSync(adminRoute), 'SC1: Backend route exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/governed-invoices');

    assert(fs.existsSync(path.join(uiAdmin, 'GovernedInvoicesPage.tsx')), 'SC2: GovernedInvoicesPage exists');
    assert(fs.existsSync(path.join(uiAdmin, 'GovernedInvoiceTable.tsx')), 'SC3: GovernedInvoiceTable exists');
    assert(fs.existsSync(path.join(uiAdmin, 'GovernedInvoiceDetail.tsx')), 'SC4: GovernedInvoiceDetail exists');
    assert(fs.existsSync(path.join(uiAdmin, 'GovernedCreditNoteTable.tsx')), 'SC5: GovernedCreditNoteTable exists');

    assert(fs.existsSync(path.join(ROOT, 'src/ui/api/governedInvoicesClient.ts')), 'SC6: API client exists');
    assert(fs.existsSync(path.join(ROOT, 'src/ui/types/governedInvoices.ts')), 'SC7: Types file exists');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'GovernedInvoicesPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Governed invoice lifecycle only'), 'SC8: Required caution copy exists (governed)');
    assert(adminPageContent.includes('Manual finalization required'), 'SC9: Required caution copy exists (manual)');
    assert(adminPageContent.includes('does not execute payment'), 'SC10: Required caution copy exists (no payment)');
    assert(adminPageContent.includes('does not execute refund'), 'SC11: Required caution copy exists (no refund)');
    assert(adminPageContent.includes('No external invoice submission is enabled'), 'SC12: Required caution copy exists (no external invoice)');
    assert(adminPageContent.includes('No tax filing is enabled'), 'SC13: Required caution copy exists (no tax)');
    assert(adminPageContent.includes('Prepared for accounting review'), 'SC14: Required caution copy exists (prepared for accounting)');

    assert(!adminPageContent.includes('executePayment') && !adminPageContent.includes('submitExternal'), 'SC15: No payment/refund/payout/tax filing/external submission integration exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/governed-invoices/:invoiceId/finalize'), 'SC16: Manual finalization actions exist');
    assert(routeContent.includes('/governed-credit-notes'), 'SC17: Credit note actions exist');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 94E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
