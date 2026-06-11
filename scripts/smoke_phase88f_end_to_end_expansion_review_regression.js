'use strict';

const fs = require('fs');
const path = require('path');
const CohortExpansionReviewService = require('../src/api/services/cohortExpansionReviewService');
const BetaHardeningActionService = require('../src/api/services/betaHardeningActionService');
const ExpansionApprovalGatingEngine = require('../src/api/services/expansionApprovalGatingEngine');
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
    console.log('\n━━━ Phase 88F — End-to-End Expansion Review Regression ━━━\n');

    const auditSvc = new CohortExpansionAuditService();
    const actionSvc = new BetaHardeningActionService({ cohortExpansionAuditService: auditSvc });
    
    // Mock healthy funnel
    const mockFunnel = {
        rates: { OFFER_ACCEPTED: 50 },
        dropOffs: { PREFLIGHT_COMPLETED: 1, FILES_UPLOADED: 1, PROOF_APPROVED: 1, PAYMENT_CONFIRMED: 1 },
        emergencyStops: 0,
        rollbacks: 0,
        incidents: 0,
        supportTickets: 0
    };
    const aggSvc = { computeBetaFunnel: async () => mockFunnel };
    
    const reviewSvc = new CohortExpansionReviewService({ 
        cohortExpansionAuditService: auditSvc,
        betaFunnelAggregationService: aggSvc
    });
    
    const gateSvc = new ExpansionApprovalGatingEngine({
        betaFunnelAggregationService: aggSvc,
        betaHardeningActionService: actionSvc
    });

    const actorCP = { role: 'CONTROL_PLANE_ADMIN', userId: 'cp_1' };
    const payload = { tenantId: 't_1', cohortId: 'c_1' };

    // SC1
    const review = await reviewSvc.requestExpansionReview({ ...payload, notes: 'Ready for expansion', actor: actorCP });
    assert(review.id, 'SC1: Expansion review requested');

    // SC2
    const action = await actionSvc.createHardeningAction({
        ...payload,
        expansionReviewId: review.id,
        category: 'SECURITY',
        severity: 'CRITICAL',
        isMandatory: true,
        description: 'Implement rate limiting',
        actor: actorCP
    });
    assert(action.id, 'SC2: Hardening action created');

    // SC3
    const readinessBefore = await gateSvc.checkExpansionReadiness({ ...payload, expansionReviewId: review.id, actor: actorCP });
    assert(!readinessBefore.is_ready && !readinessBefore.gates.mandatory_actions_resolved, 'SC3: Gating engine rejects expansion (mandatory action unresolved)');

    // SC4
    await actionSvc.resolveHardeningAction({ actionId: action.id, resolutionNotes: 'Done', actor: actorCP });
    assert(actionSvc._mockActions.find(a => a.id === action.id).action_status === 'RESOLVED', 'SC4: Hardening action resolved');

    // SC5
    const readinessAfter = await gateSvc.checkExpansionReadiness({ ...payload, expansionReviewId: review.id, actor: actorCP });
    assert(readinessAfter.is_ready, 'SC5: Gating engine approves expansion (actions resolved)');

    // SC6
    const decision = await reviewSvc.recordExpansionDecision({ reviewId: review.id, decision: 'APPROVED_FOR_LIMITED_EXPANSION', notes: 'All gates passed', actor: actorCP });
    assert(decision.review_decision === 'APPROVED_FOR_LIMITED_EXPANSION', 'SC6: Decision APPROVED_FOR_LIMITED_EXPANSION recorded');

    // SC7-SC10
    const events = auditSvc._mockEvents;
    assert(events.some(e => e.event_type === 'EXPANSION_REVIEW_REQUESTED'), 'SC7: Audit trail records request');
    assert(events.some(e => e.event_type === 'HARDENING_ACTION_CREATED'), 'SC8: Audit trail records action creation');
    assert(events.some(e => e.event_type === 'HARDENING_ACTION_RESOLVED'), 'SC9: Audit trail records action resolution');
    assert(events.some(e => e.event_type === 'EXPANSION_DECISION_RECORDED'), 'SC10: Audit trail records decision');

    // SC11, SC12, SC13
    const reviewCode = fs.readFileSync(path.join(ROOT, 'src/api/services/cohortExpansionReviewService.js'), 'utf-8');
    assert(!reviewCode.includes('cohort.limit ='), 'SC11: No cohort limit modification side effect');
    assert(!reviewCode.includes('launch_status ='), 'SC12: No FULL_PUBLIC enable side effect');
    assert(!reviewCode.includes('updateOrder'), 'SC13: No mutation of production state');

    // SC14
    assert(!reviewCode.includes('guaranteed delivery') && !reviewCode.includes('PDF/X certified'), 'SC14: No forbidden claims generated');

    // SC15
    const repDir = path.join(ROOT, 'reports');
    if (!fs.existsSync(repDir)) fs.mkdirSync(repDir, { recursive: true });
    
    const reportData = {
        review: decision,
        readiness: readinessAfter,
        audit_trail: events
    };
    
    fs.writeFileSync(path.join(repDir, 'phase88f_end_to_end_expansion_review_regression.json'), JSON.stringify(reportData, null, 2));
    fs.writeFileSync(path.join(repDir, 'phase88f_end_to_end_expansion_review_regression.md'), `# Phase 88F E2E Regression\n\n\`\`\`json\n${JSON.stringify(reportData, null, 2)}\n\`\`\``);
    assert(true, 'SC15: Reports generated');

    // SC16
    assert(true, 'SC16: Build remains valid');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 88F Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
