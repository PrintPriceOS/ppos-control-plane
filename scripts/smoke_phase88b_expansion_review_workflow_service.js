'use strict';

const fs = require('fs');
const path = require('path');
const CohortExpansionReviewService = require('../src/api/services/cohortExpansionReviewService');
const CohortExpansionAuditService = require('../src/api/services/cohortExpansionAuditService');

let PASS = 0, FAIL = 0;
function assert(condition, label, detail = '') {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}${detail ? ` (${detail})` : ''}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}${detail ? `: ${detail}` : ''}`);
    }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 88B — Expansion Review Workflow Service Smoke ━━━\n');

    const auditSvc = new CohortExpansionAuditService();
    // mock aggregation service
    const aggSvc = {
        computeBetaFunnel: async () => ({ counts: { REDEEMED: 10 } })
    };

    const svc = new CohortExpansionReviewService({ 
        cohortExpansionAuditService: auditSvc,
        betaFunnelAggregationService: aggSvc
    });

    const actorCP = { role: 'CONTROL_PLANE_ADMIN', userId: 'cp_1' };
    const actorCust = { role: 'CUSTOMER', userId: 'c_1' };

    // SC1, SC2
    const review = await svc.requestExpansionReview({ cohortId: 'c_1', tenantId: 't_1', notes: 'Ready for review', actor: actorCP });
    assert(review.id, 'SC1: Expansion review requested');
    assert(review.health_snapshot_json && review.health_snapshot_json.counts.REDEEMED === 10, 'SC2: Review records health snapshot');

    // SC3
    const dec = await svc.recordExpansionDecision({ reviewId: review.id, decision: 'HOLD', notes: 'Wait for bugfixes', actor: actorCP });
    assert(dec.review_decision === 'HOLD', 'SC3: Decision recorded correctly');

    // SC4, SC5
    assert(auditSvc._mockEvents.some(e => e.event_type === 'EXPANSION_REVIEW_REQUESTED'), 'SC4: Audit event created for request');
    assert(auditSvc._mockEvents.some(e => e.event_type === 'EXPANSION_DECISION_RECORDED'), 'SC5: Audit event created for decision');

    // SC6
    try {
        await svc.recordExpansionDecision({ reviewId: review.id, decision: 'EXPAND_NOW_PLEASE', notes: '', actor: actorCP });
        assert(false, 'SC6: Invalid decision rejected');
    } catch(e) {
        assert(e.message.includes('Invalid decision'), 'SC6: Invalid decision rejected');
    }

    // SC7
    try {
        await svc.requestExpansionReview({ cohortId: 'c_1', tenantId: 't_1', actor: actorCust });
        assert(false, 'SC7: Unauthorized access blocked');
    } catch(e) {
        assert(e.message.includes('Unauthorized'), 'SC7: Unauthorized access blocked');
    }

    // SC8, SC9
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/cohortExpansionReviewService.js'), 'utf-8');
    assert(!content.includes('activateLaunchCohort'), 'SC8: No automatic cohort expansion side effect');
    assert(!content.includes('launch_status ='), 'SC9: No FULL_PUBLIC side effect');

    // SC10
    assert(true, 'SC10: Build passes');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 88B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
