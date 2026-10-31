'use strict';

const fs = require('fs');
const path = require('path');
const GovernedInvoiceBuilderService = require('../src/api/services/governedInvoiceBuilderService');

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
    console.log('\n━━━ Phase 94B — Governed Invoice Builder Smoke ━━━\n');

    const svc = new GovernedInvoiceBuilderService();
    const actorAdmin = { role: 'FINANCE_ADMIN', userId: 'a_1' };

    const cleanOrder = { order_id: 'o_1', tenant_id: 't_1', currency: 'USD', amount: 100 };
    const cleanTaxSnap = { id: 'tax_1', readiness_status: 'READY', currency: 'USD', tax_amount_estimated: 20 };
    
    // SC1
    const inv1 = await svc.buildGovernedInvoice({ orderData: cleanOrder, taxSnapshot: cleanTaxSnap, reconciliationSnapshot: null, actor: actorAdmin });
    assert(inv1.lifecycle_status === 'DRAFT', 'SC1: Clean reconciled order with tax readiness snapshot creates DRAFT');

    // SC2
    const inv2 = await svc.buildGovernedInvoice({ orderData: cleanOrder, taxSnapshot: null, reconciliationSnapshot: null, actor: actorAdmin });
    assert(inv2.lifecycle_status === 'MANUAL_REVIEW_REQUIRED' && inv2.warnings.some(w => w.includes('Missing tax')), 'SC2: Missing tax/VAT readiness snapshot requires review');

    // SC3
    const reconSnapMismatch = { run_id: 'r_1', mismatch_count: 1 };
    const inv3 = await svc.buildGovernedInvoice({ orderData: cleanOrder, taxSnapshot: cleanTaxSnap, reconciliationSnapshot: reconSnapMismatch, actor: actorAdmin });
    assert(inv3.lifecycle_status === 'MANUAL_REVIEW_REQUIRED' && inv3.warnings.some(w => w.includes('Reconciliation mismatch')), 'SC3: Reconciliation mismatch present requires review');

    // SC4
    const diffCurrencyOrder = { ...cleanOrder, currency: 'EUR' };
    const inv4 = await svc.buildGovernedInvoice({ orderData: diffCurrencyOrder, taxSnapshot: cleanTaxSnap, reconciliationSnapshot: null, actor: actorAdmin });
    assert(inv4.lifecycle_status === 'MANUAL_REVIEW_REQUIRED' && inv4.warnings.some(w => w.includes('Currency mismatch')), 'SC4: Currency mismatch requires review');

    // SC5 (from SC2,3,4)
    assert(svc._mockEvents.some(e => e.event_type === 'GOVERNED_INVOICE_MANUAL_REVIEW_REQUIRED'), 'SC5: Manual review required event logged');

    // SC6
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/governedInvoiceBuilderService.js'), 'utf-8');
    assert(!content.includes('UPDATE orders') && !content.includes('UPDATE payments'), 'SC6: Source objects remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 94B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
