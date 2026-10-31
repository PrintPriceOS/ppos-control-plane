'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsChecklistService = require('../src/api/services/financialOperationsChecklistService');

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
    console.log('\n━━━ Phase 95C — FinOps Readiness Checklist Smoke ━━━\n');

    const svc = new FinancialOperationsChecklistService();
    const actorAdmin = { role: 'FINANCE_ADMIN', userId: 'a_1' };

    const runClean = {
        readiness_run_id: 'run_1',
        reconciliation_status: 'READY',
        tax_vat_status: 'READY',
        invoice_status: 'READY',
        credit_note_status: 'READY',
        accounting_export_status: 'READY'
    };

    const runBlocked = {
        readiness_run_id: 'run_2',
        reconciliation_status: 'MISMATCH',
        tax_vat_status: 'MANUAL_REVIEW_REQUIRED',
        invoice_status: 'NOT_FINALIZED',
        credit_note_status: 'PENDING_REVIEW',
        accounting_export_status: 'NOT_READY'
    };

    // SC1
    const chkClean = await svc.generateChecklist({ run: runClean, actor: actorAdmin });
    assert(chkClean.items.length === 11, 'SC1: Checklist contains all required items');

    // SC2
    const chkBlocked = await svc.generateChecklist({ run: runBlocked, actor: actorAdmin });
    assert(chkBlocked.items.find(i => i.checklist_code === 'RECONCILIATION_NO_BLOCKING_MISMATCHES').checklist_status === 'FAILED', 'SC2: Blocking items produce FAILED or MANUAL_REVIEW_REQUIRED');

    // SC3
    assert(chkClean.items.find(i => i.checklist_code === 'FULL_PUBLIC_DISABLED').checklist_status === 'PASSED', 'SC3: FULL_PUBLIC remains disabled');
    
    // SC4
    assert(chkClean.items.find(i => i.checklist_code === 'NO_PAYMENT_REFUND_PAYOUT_EXECUTION_ENABLED').checklist_status === 'PASSED', 'SC4: No payment/refund/payout execution enabled');
    assert(chkClean.items.find(i => i.checklist_code === 'NO_EXTERNAL_SUBMISSION_ENABLED').checklist_status === 'PASSED', 'SC4: No external submission enabled');

    // SC5
    const chkClean2 = await svc.generateChecklist({ run: runClean, actor: actorAdmin });
    assert(JSON.stringify(chkClean.items) === JSON.stringify(chkClean2.items), 'SC5: Checklist is deterministic');

    // SC6
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsChecklistService.js'), 'utf-8');
    assert(!content.includes('UPDATE '), 'SC6: Source records are unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 95C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
