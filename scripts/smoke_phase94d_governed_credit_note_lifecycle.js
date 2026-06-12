'use strict';

const fs = require('fs');
const path = require('path');
const GovernedInvoiceBuilderService = require('../src/api/services/governedInvoiceBuilderService');
const GovernedInvoiceLifecycleService = require('../src/api/services/governedInvoiceLifecycleService');
const GovernedCreditNoteService = require('../src/api/services/governedCreditNoteService');

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
    console.log('\n━━━ Phase 94D — Governed Credit Note Lifecycle Smoke ━━━\n');

    const builderSvc = new GovernedInvoiceBuilderService();
    const lifeSvc = new GovernedInvoiceLifecycleService({ governedInvoiceBuilderService: builderSvc });
    const cnSvc = new GovernedCreditNoteService({ governedInvoiceLifecycleService: lifeSvc });
    const actorAdmin = { role: 'FINANCE_ADMIN', userId: 'a_1' };

    const cleanOrder = { order_id: 'o_1', tenant_id: 't_1', currency: 'USD', amount: 100 };
    const cleanTaxSnap = { id: 'tax_1', readiness_status: 'READY', currency: 'USD', tax_amount_estimated: 20 };
    
    const inv = await builderSvc.buildGovernedInvoice({ orderData: cleanOrder, taxSnapshot: cleanTaxSnap, reconciliationSnapshot: null, actor: actorAdmin });
    await lifeSvc.transitionLifecycle({ invoiceId: inv.invoice_id, actionType: 'APPROVE_FOR_FINALIZATION', actor: actorAdmin });

    // SC1
    const payload = { reason_code: 'CUSTOMER_REFUND', subtotal_amount: -100, tax_amount: -20, reason_note: 'Refund' };
    const cn = await cnSvc.buildGovernedCreditNote({ invoiceId: inv.invoice_id, payload, actor: actorAdmin });
    assert(cn.lifecycle_status === 'DRAFT', 'SC1: Credit note draft creation');

    // SC2
    await cnSvc.linkCreditNoteToInvoice({ creditNoteId: cn.credit_note_id, invoiceId: inv.invoice_id, amountApplied: -120, actor: actorAdmin });
    assert(cnSvc._mockLinks.some(l => l.credit_note_id === cn.credit_note_id && l.invoice_id === inv.invoice_id), 'SC2: Credit note links to invoice');

    // SC3
    await cnSvc.finalizeCreditNote({ creditNoteId: cn.credit_note_id, actor: actorAdmin });
    assert(cn.lifecycle_status === 'FINALIZED', 'SC3: Credit note finalization manual only');

    // SC4 & SC5
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/governedCreditNoteService.js'), 'utf-8');
    assert(!content.includes('executeRefund') && !content.includes('stripe'), 'SC4: No refund execution');
    assert(!content.includes('UPDATE invoices') && !content.includes('UPDATE payments'), 'SC5: No source invoice/payment mutation');

    // SC6
    assert(cnSvc._mockEvents.some(e => e.event_type === 'GOVERNED_CREDIT_NOTE_FINALIZED_MANUALLY'), 'SC6: Audit events exist');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 94D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
