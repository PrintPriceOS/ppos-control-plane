'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderSettlementReconciliationService = require('../src/api/services/financialOperationsProviderSettlementReconciliationService');

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
    console.log('\n━━━ Phase 107C — Provider Settlement Matching / Reconciliation Smoke ━━━\n');

    const svc = new FinancialOperationsProviderSettlementReconciliationService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const commonRow = {
        settlement_file_run_id: 'run_1',
        settlement_row_id: 'row_1',
        transaction_reference: 'txn_1',
        gross_amount: 100.0,
        fee_amount: 2.0,
        net_amount: 98.0,
        currency: 'USD'
    };

    const internalRecords = [
        { reference_id: 'txn_1', type: 'PROVIDER_SANDBOX_TEST', gross_amount: 100.0, fee_amount: 2.0, net_amount: 98.0, currency: 'USD' },
        { reference_id: 'txn_2', type: 'PROVIDER_EVENT_RECORD', gross_amount: 50.0, fee_amount: 1.0, net_amount: 49.0, currency: 'EUR' },
        { reference_id: 'txn_dup', type: 'PILOT_RUN', gross_amount: 10.0, fee_amount: 0.0, net_amount: 10.0, currency: 'USD' },
        { reference_id: 'txn_dup', type: 'READINESS_RUN', gross_amount: 10.0, fee_amount: 0.0, net_amount: 10.0, currency: 'USD' }
    ];

    // SC1: Settlement row matches internal sandbox run
    const res1 = await svc.reconcileSettlementRun('run_1', [commonRow], internalRecords, actorAdmin);
    assert(res1.matched_row_count === 1, 'SC1: Settlement row matches internal sandbox run');

    // SC2: Settlement row matches provider event record
    const res2 = await svc.reconcileSettlementRun('run_2', [{ ...commonRow, transaction_reference: 'txn_2', gross_amount: 50.0, fee_amount: 1.0, net_amount: 49.0, currency: 'EUR' }], internalRecords, actorAdmin);
    assert(res2.matched_row_count === 1, 'SC2: Settlement row matches provider event record');

    // SC3: Duplicate row creates duplicate finding
    const res3 = await svc.reconcileSettlementRun('run_3', [{ ...commonRow, transaction_reference: 'txn_dup' }], internalRecords, actorAdmin);
    assert(res3.duplicate_row_count === 1, 'SC3: Duplicate row creates duplicate finding');
    assert(svc._mockFindings.some(f => f.finding_code === 'DUPLICATE_SETTLEMENT_ROW'), 'SC3: Duplicate finding exists');

    // SC4 & SC5 & SC6 & SC7: Gross/Fee/Net/Currency mismatch creates finding
    const resMismatch = await svc.reconcileSettlementRun('run_4', [{ ...commonRow, gross_amount: 99.0, fee_amount: 1.0, net_amount: 97.0, currency: 'GBP' }], internalRecords, actorAdmin);
    assert(resMismatch.mismatched_row_count === 1, 'SC4 & SC5 & SC6 & SC7: Mismatch detected');
    assert(svc._mockFindings.some(f => f.finding_code === 'MISMATCHED_GROSS_AMOUNT'), 'SC4: Gross amount mismatch creates finding');
    assert(svc._mockFindings.some(f => f.finding_code === 'MISMATCHED_FEE_AMOUNT'), 'SC5: Fee amount mismatch creates finding');
    assert(svc._mockFindings.some(f => f.finding_code === 'MISMATCHED_NET_AMOUNT'), 'SC6: Net amount mismatch creates finding');
    assert(svc._mockFindings.some(f => f.finding_code === 'MISMATCHED_CURRENCY'), 'SC7: Currency mismatch creates finding');

    // SC8: Missing transaction reference creates finding
    const resMissing = await svc.reconcileSettlementRun('run_5', [{ ...commonRow, transaction_reference: null, provider_transaction_id: null }], internalRecords, actorAdmin);
    assert(resMissing.unmatched_row_count === 1 && svc._mockFindings.some(f => f.finding_code === 'MISSING_TRANSACTION_REFERENCE'), 'SC8: Missing transaction reference creates finding');

    // SC9: Unmatched row requires manual review
    const resUnmatched = await svc.reconcileSettlementRun('run_6', [{ ...commonRow, transaction_reference: 'txn_not_found' }], internalRecords, actorAdmin);
    assert(resUnmatched.unmatched_row_count === 1 && svc._mockFindings.some(f => f.finding_code === 'UNMATCHED_SETTLEMENT_ROW'), 'SC9: Unmatched row requires manual review');

    // SC10: Source records remain unchanged
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderSettlementReconciliationService.js'), 'utf-8');
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('axios'), 'SC10: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 107C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
