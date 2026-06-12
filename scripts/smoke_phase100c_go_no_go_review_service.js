'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsGoNoGoReviewService = require('../src/api/services/financialOperationsGoNoGoReviewService');

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
    console.log('\n━━━ Phase 100C — Go / No-Go Decision Service Smoke ━━━\n');

    const svc = new FinancialOperationsGoNoGoReviewService();
    const actorExec = { role: 'EXECUTIVE', userId: 'exec_1' };
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const revId = 'par_123';

    // SC1
    const reqRes = await svc.processAction(revId, 'REQUEST_GO_NO_GO_REVIEW', { review_status: 'READY_FOR_GO_NO_GO_REVIEW' }, actorAdmin);
    assert(reqRes.go_no_go_status === 'IN_REVIEW', 'SC1: REQUEST_GO_NO_GO_REVIEW sets status to IN_REVIEW');

    // SC2
    try {
        await svc.processAction('par_blocked', 'MARK_GO_RECOMMENDED', { review_status: 'BLOCKED_BY_SECURITY' }, actorExec);
        assert(false, 'SC2: Should throw on marking GO on blocked review');
    } catch (e) {
        assert(e.message.includes('Cannot mark GO on a blocked review'), 'SC2: BLOCKED review cannot be marked GO');
    }

    // SC3 & SC4
    const goRes = await svc.processAction(revId, 'MARK_GO_RECOMMENDED', {}, actorExec);
    assert(goRes.go_no_go_status === 'GO_RECOMMENDED', 'SC3: GO sets status to GO_RECOMMENDED');
    
    // Check audit events for text
    const evGo = svc._mockEvents.find(e => e.event_type === 'FINOPS_GO_RECOMMENDED_FOR_FUTURE_CONTROLLED_ACTIVATION');
    assert(evGo.payload_json.message.includes('Does NOT activate production'), 'SC4: GO does not enable production explicitly in audit');

    // SC5
    const noGoRes = await svc.processAction(revId, 'MARK_NO_GO', { note: 'Missing doc' }, actorExec);
    assert(noGoRes.go_no_go_status === 'NO_GO' && noGoRes.review_status === 'BLOCKED_BY_NO_GO_DECISION', 'SC5: NO_GO blocks the review');

    // SC6
    const revRes = await svc.processAction(revId, 'REVOKE_GO_RECOMMENDATION', { note: 'Re-evaluating' }, actorExec);
    assert(revRes.go_no_go_status === 'REVOKED' && revRes.review_status === 'MANUAL_REVIEW_REQUIRED', 'SC6: Revocation sets REVOKED and requires manual review');

    // SC7
    const noteRes = await svc.processAction(revId, 'ADD_SECURITY_REVIEW_NOTE', { note: 'Looks good' }, actorAdmin);
    assert(noteRes.notes.length === 1 && noteRes.notes[0].note === 'Looks good', 'SC7: Notes are recorded');
    assert(svc._mockEvents.some(e => e.event_type === 'FINOPS_GO_NO_GO_REVIEW_NOTE_ADDED'), 'SC7: Notes are audited');

    // SC8
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsGoNoGoReviewService.js'), 'utf-8');
    assert(!content.includes('UPDATE reviews'), 'SC8: Read-only memory logic (mocked), no source mutation');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 100C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
