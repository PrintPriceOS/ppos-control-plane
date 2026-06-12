'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsReadinessAggregatorService = require('../src/api/services/financialOperationsReadinessAggregatorService');

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
    console.log('\n━━━ Phase 95B — FinOps Readiness Aggregator Smoke ━━━\n');

    const svc = new FinancialOperationsReadinessAggregatorService();
    const actorAdmin = { role: 'FINANCE_ADMIN', userId: 'a_1' };

    const cleanRecon = { run_id: 'r_1', mismatch_count: 0 };
    const cleanTax = { id: 'tax_1', readiness_status: 'READY' };
    const cleanInv = { invoice_id: 'inv_1', lifecycle_status: 'FINALIZED', tenant_id: 't_1' };
    const cleanCN = { credit_note_id: 'cn_1', lifecycle_status: 'FINALIZED' };
    
    // SC1
    const run1 = await svc.aggregateReadiness({ reconciliationSnapshot: cleanRecon, taxSnapshot: cleanTax, invoice: cleanInv, creditNotes: [cleanCN], exportStatus: 'READY', actor: actorAdmin });
    assert(run1.readiness_status === 'READY_FOR_FINANCIAL_OPERATIONS_REVIEW', 'SC1: Fully clean inputs produce READY_FOR_FINANCIAL_OPERATIONS_REVIEW');

    // SC2
    const badRecon = { run_id: 'r_2', mismatch_count: 1 };
    const run2 = await svc.aggregateReadiness({ reconciliationSnapshot: badRecon, taxSnapshot: cleanTax, invoice: cleanInv, exportStatus: 'READY', actor: actorAdmin });
    assert(run2.readiness_status === 'BLOCKED_BY_RECONCILIATION', 'SC2: Reconciliation mismatch blocker');

    // SC3
    const badTax = { id: 'tax_2', readiness_status: 'ACCOUNTANT_REVIEW_REQUIRED' };
    const run3 = await svc.aggregateReadiness({ reconciliationSnapshot: cleanRecon, taxSnapshot: badTax, invoice: cleanInv, exportStatus: 'READY', actor: actorAdmin });
    assert(run3.readiness_status === 'BLOCKED_BY_TAX_VAT_REVIEW', 'SC3: Tax/VAT manual review blocker');

    // SC4
    const badInv = { invoice_id: 'inv_2', lifecycle_status: 'READY_FOR_REVIEW', tenant_id: 't_1' };
    const run4 = await svc.aggregateReadiness({ reconciliationSnapshot: cleanRecon, taxSnapshot: cleanTax, invoice: badInv, exportStatus: 'READY', actor: actorAdmin });
    assert(run4.readiness_status === 'BLOCKED_BY_INVOICE_LIFECYCLE', 'SC4: Invoice not manually finalized blocker');

    // SC5
    const badCN = { credit_note_id: 'cn_2', lifecycle_status: 'DRAFT' };
    const run5 = await svc.aggregateReadiness({ reconciliationSnapshot: cleanRecon, taxSnapshot: cleanTax, invoice: cleanInv, creditNotes: [badCN], exportStatus: 'READY', actor: actorAdmin });
    assert(run5.readiness_status === 'BLOCKED_BY_CREDIT_NOTE_LIFECYCLE', 'SC5: Credit note pending review blocker');

    // SC6
    const run6 = await svc.aggregateReadiness({ reconciliationSnapshot: cleanRecon, taxSnapshot: cleanTax, invoice: cleanInv, exportStatus: 'PENDING', actor: actorAdmin });
    assert(run6.readiness_status === 'BLOCKED_BY_ACCOUNTING_EXPORT', 'SC6: Accounting export not ready blocker');

    // SC7
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsReadinessAggregatorService.js'), 'utf-8');
    assert(!content.includes('UPDATE orders') && !content.includes('UPDATE invoices'), 'SC7: Source objects remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 95B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
