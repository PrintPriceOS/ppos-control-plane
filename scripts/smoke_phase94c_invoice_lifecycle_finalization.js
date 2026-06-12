'use strict';

const fs = require('fs');
const path = require('path');
const GovernedInvoiceBuilderService = require('../src/api/services/governedInvoiceBuilderService');
const GovernedInvoiceLifecycleService = require('../src/api/services/governedInvoiceLifecycleService');

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
    console.log('\n━━━ Phase 94C — Invoice Lifecycle Finalization Smoke ━━━\n');

    const builderSvc = new GovernedInvoiceBuilderService();
    const lifeSvc = new GovernedInvoiceLifecycleService({ governedInvoiceBuilderService: builderSvc });
    const actorAdmin = { role: 'FINANCE_ADMIN', userId: 'a_1' };

    const cleanOrder = { order_id: 'o_1', tenant_id: 't_1', currency: 'USD', amount: 100 };
    const cleanTaxSnap = { id: 'tax_1', readiness_status: 'READY', currency: 'USD', tax_amount_estimated: 20 };
    
    const inv = await builderSvc.buildGovernedInvoice({ orderData: cleanOrder, taxSnapshot: cleanTaxSnap, reconciliationSnapshot: null, actor: actorAdmin });

    // SC1
    await lifeSvc.transitionLifecycle({ invoiceId: inv.invoice_id, actionType: 'MARK_READY_FOR_REVIEW', actor: actorAdmin });
    assert(inv.lifecycle_status === 'READY_FOR_REVIEW', 'SC1: Status transitions work');

    // SC2
    await lifeSvc.transitionLifecycle({ invoiceId: inv.invoice_id, actionType: 'APPROVE_FOR_FINALIZATION', actor: actorAdmin });
    await lifeSvc.transitionLifecycle({ invoiceId: inv.invoice_id, actionType: 'FINALIZE_INVOICE_MANUALLY', actor: actorAdmin });
    assert(inv.lifecycle_status === 'FINALIZED' && inv.finalized_at, 'SC2: Finalization is manual only');

    // SC3
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/governedInvoiceLifecycleService.js'), 'utf-8');
    assert(!content.includes('http') && !content.includes('submitExternal'), 'SC3: No external submission happens');

    // SC4
    await lifeSvc.transitionLifecycle({ invoiceId: inv.invoice_id, actionType: 'CREATE_NEW_VERSION', payload: { change_reason: 'Fix amount', new_payload: { subtotal_amount: 90, tax_amount: 18 } }, actor: actorAdmin });
    assert(lifeSvc._mockVersions.length === 1 && inv.subtotal_amount === 90, 'SC4: Versioning occurs on invoice changes');

    // SC5
    await lifeSvc.transitionLifecycle({ invoiceId: inv.invoice_id, actionType: 'VOID_INVOICE', actor: actorAdmin });
    assert(inv.lifecycle_status === 'VOIDED', 'SC5: Void action updates status');
    assert(!content.includes('UPDATE orders'), 'SC5: Void action does not mutate source records');

    // SC6
    const timeline = await lifeSvc.getAuditTimeline(inv.invoice_id, actorAdmin);
    assert(timeline.length > 5, 'SC6: Audit timeline is generated');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 94C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
