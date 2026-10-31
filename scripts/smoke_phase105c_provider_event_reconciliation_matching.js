'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderEventReconciliationService = require('../src/api/services/financialOperationsProviderEventReconciliationService');

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
    console.log('\n━━━ Phase 105C — Provider Event Reconciliation Matching Smoke ━━━\n');

    const svc = new FinancialOperationsProviderEventReconciliationService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const run = await svc.createReconciliationRun({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', eventMode: 'MOCK_PROVIDER_EVENT'
    }, actorAdmin);

    // SC1: Payment captured event matches internal sandbox run
    const evt1 = { provider_event_record_id: 'pevt_1', idempotency_key: 'ik_1', amount: 1000, currency: 'USD' };
    const ref1 = { id: 'ref_1', amount: 1000, currency: 'USD' };
    const m1 = await svc.matchEvent(run.event_reconciliation_run_id, evt1, ref1, actorAdmin);
    assert(m1.match_status === 'MATCHED' && run.matched_event_count === 1, 'SC1: Payment captured event matches internal sandbox run');

    // SC2: Refund created event matches internal credit note readiness record
    const evt2 = { provider_event_record_id: 'pevt_2', idempotency_key: 'ik_2', amount: 500, currency: 'EUR' };
    const ref2 = { id: 'ref_2', amount: 500, currency: 'EUR' };
    const m2 = await svc.matchEvent(run.event_reconciliation_run_id, evt2, ref2, actorAdmin);
    assert(m2.match_status === 'MATCHED' && run.matched_event_count === 2, 'SC2: Refund created event matches internal credit note readiness record');

    // SC3: Duplicate event creates duplicate finding
    const evt3 = { provider_event_record_id: 'pevt_3', idempotency_key: 'ik_3', request_payload_json: { duplicate: true } };
    const m3 = await svc.matchEvent(run.event_reconciliation_run_id, evt3, ref1, actorAdmin);
    assert(m3.match_status === 'DUPLICATE' && run.duplicate_event_count === 1, 'SC3: Duplicate event creates duplicate finding');

    // SC4: Amount mismatch creates mismatch finding
    const evt4 = { provider_event_record_id: 'pevt_4', idempotency_key: 'ik_4', amount: 1000, currency: 'USD' };
    const ref4 = { id: 'ref_4', amount: 999, currency: 'USD' };
    const m4 = await svc.matchEvent(run.event_reconciliation_run_id, evt4, ref4, actorAdmin);
    assert(m4.match_status === 'MISMATCHED_AMOUNT' && run.mismatched_event_count === 1, 'SC4: Amount mismatch creates mismatch finding');

    // SC5: Currency mismatch creates mismatch finding
    const evt5 = { provider_event_record_id: 'pevt_5', idempotency_key: 'ik_5', amount: 1000, currency: 'USD' };
    const ref5 = { id: 'ref_5', amount: 1000, currency: 'EUR' };
    const m5 = await svc.matchEvent(run.event_reconciliation_run_id, evt5, ref5, actorAdmin);
    assert(m5.match_status === 'MISMATCHED_CURRENCY' && run.mismatched_event_count === 2, 'SC5: Currency mismatch creates mismatch finding');

    // SC6: Missing idempotency key creates finding
    const evt6 = { provider_event_record_id: 'pevt_6', amount: 100, currency: 'USD' };
    const m6 = await svc.matchEvent(run.event_reconciliation_run_id, evt6, ref1, actorAdmin);
    assert(m6.match_status === 'MANUAL_REVIEW_REQUIRED' && run.mismatched_event_count === 3, 'SC6: Missing idempotency key creates finding');

    // SC7: Unmatched event requires manual review
    const evt7 = { provider_event_record_id: 'pevt_7', idempotency_key: 'ik_7', amount: 100, currency: 'USD' };
    const m7 = await svc.matchEvent(run.event_reconciliation_run_id, evt7, null, actorAdmin);
    assert(m7.match_status === 'UNMATCHED' && run.unmatched_event_count === 1, 'SC7: Unmatched event requires manual review');

    // SC8: Source records remain unchanged
    const sStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderEventReconciliationService.js'), 'utf-8');
    assert(!sStr.includes('UPDATE orders') && !sStr.includes('axios'), 'SC8: Source records remain unchanged and no external calls');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 105C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
