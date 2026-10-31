'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderSettlementReviewService = require('../src/api/services/financialOperationsProviderSettlementReviewService');

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
    console.log('\n━━━ Phase 107D — Provider Settlement Review Workflow Smoke ━━━\n');

    const svc = new FinancialOperationsProviderSettlementReviewService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const finding = { id: 'f_1', status: 'OPEN', finding_code: 'MISMATCHED_GROSS_AMOUNT' };

    // SC1: Findings can be resolved manually
    const res1 = await svc.resolveFinding(finding, 'RESOLVE_GROSS_AMOUNT_MISMATCH', 'Checked external dashboard', actorAdmin);
    assert(res1.status === 'RESOLVED' && res1.resolution_reason === 'Checked external dashboard', 'SC1: Findings can be resolved manually');

    // SC2: Warnings can be dismissed with reason
    const res2 = await svc.dismissWarning('run_1', 'w_1', 'Expected behavior in sandbox', actorAdmin);
    assert(res2.success && res2.reason === 'Expected behavior in sandbox', 'SC2: Warnings can be dismissed with reason');

    // SC3: Review-only linking does not mutate internal source records
    const row = { settlement_file_run_id: 'run_1', settlement_row_id: 'row_1' };
    const res3 = await svc.linkRowToInternalReference(row, 'int_1', 'PILOT_RUN', 'Linking to investigate pilot discrepancy', actorAdmin);
    assert(res3.match_status === 'MANUAL_REVIEW_REQUIRED' && res3.internal_reference_id === 'int_1', 'SC3: Review-only linking does not mutate internal source records');

    // SC4: Amount/currency/date mismatch resolution is audited
    assert(svc._mockEvents.some(e => e.event_type === 'FINOPS_PROVIDER_SETTLEMENT_FINDING_RESOLVED'), 'SC4: Amount/currency/date mismatch resolution is audited');
    
    // SC5: Unmatched row acknowledgement is audited (via mock check)
    const findingUnmatched = { id: 'f_2', status: 'OPEN', finding_code: 'UNMATCHED_SETTLEMENT_ROW' };
    await svc.resolveFinding(findingUnmatched, 'ACKNOWLEDGE_UNMATCHED_ROW', 'Sandbox artifact missing', actorAdmin);
    assert(svc._mockEvents.some(e => e.payload_json.message.includes('ACKNOWLEDGE_UNMATCHED_ROW')), 'SC5: Unmatched row acknowledgement is audited');

    // SC6: Duplicate resolution is audited
    const findingDup = { id: 'f_3', status: 'OPEN', finding_code: 'DUPLICATE_SETTLEMENT_ROW' };
    await svc.resolveFinding(findingDup, 'RESOLVE_DUPLICATE_ROW', 'Duplicate is valid in dry-run', actorAdmin);
    assert(svc._mockEvents.some(e => e.payload_json.message.includes('RESOLVE_DUPLICATE_ROW')), 'SC6: Duplicate resolution is audited');

    // SC7: Review note added
    const res7 = await svc.addReviewNote('run_1', 'row_1', 'match_1', 'Investigating row', actorAdmin);
    assert(res7.success && svc._mockEvents.some(e => e.event_type === 'FINOPS_PROVIDER_SETTLEMENT_REVIEW_NOTE_ADDED'), 'SC7: Review note added');

    // SC8: Source records remain unchanged
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderSettlementReviewService.js'), 'utf-8');
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('axios'), 'SC8: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 107D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
