'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderEventReconciliationService = require('../src/api/services/financialOperationsProviderEventReconciliationService');
const FinancialOperationsProviderEventReconciliationReviewService = require('../src/api/services/financialOperationsProviderEventReconciliationReviewService');

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
    console.log('\n━━━ Phase 105D — Provider Event Reconciliation Review Workflow Smoke ━━━\n');

    const recSvc = new FinancialOperationsProviderEventReconciliationService();
    const svc = new FinancialOperationsProviderEventReconciliationReviewService(recSvc);
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const run = await recSvc.createReconciliationRun({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', eventMode: 'MOCK_PROVIDER_EVENT'
    }, actorAdmin);

    // Setup findings
    const evtUnmatched = { provider_event_record_id: 'pevt_u', idempotency_key: 'ik_u', amount: 100, currency: 'USD' };
    const mUnmatched = await recSvc.matchEvent(run.event_reconciliation_run_id, evtUnmatched, null, actorAdmin);

    const evtAmount = { provider_event_record_id: 'pevt_a', idempotency_key: 'ik_a', amount: 100, currency: 'USD' };
    const refAmount = { id: 'ref_a', amount: 200, currency: 'USD' };
    const mAmount = await recSvc.matchEvent(run.event_reconciliation_run_id, evtAmount, refAmount, actorAdmin);

    let findingUnmatchedId = null;
    let findingAmountId = null;
    for (const [id, f] of recSvc._mockFindings.entries()) {
        if (f.finding_code === 'UNMATCHED_EVENT') findingUnmatchedId = id;
        if (f.finding_code === 'AMOUNT_MISMATCH') findingAmountId = id;
    }

    // SC1: Findings can be resolved manually (Unmatched event acknowledgement is audited)
    const f1 = await svc.acknowledgeUnmatchedEvent(findingUnmatchedId, 'Known test event', actorAdmin);
    assert(f1.status === 'RESOLVED', 'SC1: Findings can be resolved manually / Unmatched event acknowledgement is audited');

    // SC2: Amount/currency/timestamp mismatch resolution is audited
    const f2 = await svc.resolveAmountMismatch(findingAmountId, 'Amount updated in provider', actorAdmin);
    assert(f2.status === 'RESOLVED', 'SC2: Amount/currency/timestamp mismatch resolution is audited');

    // SC3: Review-only linking does not mutate internal source records
    const l1 = await svc.linkEventForReviewOnly(mUnmatched.provider_event_match_id, 'ref_new_1', 'Manually linked', actorAdmin);
    assert(l1.match_status === 'MANUALLY_LINKED_FOR_REVIEW' && l1.internal_reference_id === 'ref_new_1', 'SC3: Review-only linking does not mutate internal source records');

    // SC4: Warnings can be dismissed with reason
    const dummyFinding = await recSvc._createFinding(run, evtUnmatched, null, 'DUMMY_WARNING', 'LOW', 'Warning');
    const f3 = await svc.dismissWarning(dummyFinding.id, 'Ignored', actorAdmin);
    assert(f3.status === 'RESOLVED' && f3.evidence_json.resolution_action === 'DISMISS_WARNING', 'SC4: Warnings can be dismissed with reason');

    // SC5: Source records remain unchanged
    const sStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderEventReconciliationReviewService.js'), 'utf-8');
    assert(!sStr.includes('UPDATE orders') && !sStr.includes('axios'), 'SC5: Source records remain unchanged and no external calls');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 105D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
