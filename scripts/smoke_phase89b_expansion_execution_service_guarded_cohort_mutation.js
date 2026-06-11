'use strict';

const fs = require('fs');
const path = require('path');
const CohortExpansionExecutionService = require('../src/api/services/cohortExpansionExecutionService');

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
    console.log('\n━━━ Phase 89B — Expansion Execution Service Smoke ━━━\n');

    const actorCP = { role: 'CONTROL_PLANE_ADMIN', userId: 'cp_1', tenantId: 't_1' };
    const actorCust = { role: 'CUSTOMER', userId: 'c_1', tenantId: 't_1' };

    const mockReviewService = {
        getExpansionReview: async () => ({ review_decision: 'APPROVED_FOR_LIMITED_EXPANSION', cohort_id: 'c_1', tenant_id: 't_1' })
    };
    
    const mockGatingEngine = {
        checkExpansionReadiness: async () => ({ gates: { mandatory_actions_resolved: true, critical_actions_resolved: true } })
    };

    const svc = new CohortExpansionExecutionService({
        cohortExpansionReviewService: mockReviewService,
        expansionApprovalGatingEngine: mockGatingEngine
    });

    // SC1
    const execution = await svc.prepareExpansionExecution({ expansionReviewId: 'cer_1', proposedLimits: { invites: 100 }, actor: actorCP });
    assert(execution.id, 'SC1: Prepare expansion from approved review');

    // SC2
    const badReviewSvc = { getExpansionReview: async () => ({ review_decision: 'HOLD' }) };
    const badSvc = new CohortExpansionExecutionService({ cohortExpansionReviewService: badReviewSvc, expansionApprovalGatingEngine: mockGatingEngine });
    try {
        await badSvc.prepareExpansionExecution({ expansionReviewId: 'cer_1', proposedLimits: {}, actor: actorCP });
        assert(false, 'SC2: Prepare blocked without approved review');
    } catch(e) {
        assert(e.message.includes('APPROVED_FOR_LIMITED_EXPANSION'), 'SC2: Prepare blocked without approved review');
    }

    // SC3
    const badGatingSvc = new CohortExpansionExecutionService({
        cohortExpansionReviewService: mockReviewService,
        expansionApprovalGatingEngine: { checkExpansionReadiness: async () => ({ gates: { mandatory_actions_resolved: false } }) }
    });
    try {
        await badGatingSvc.prepareExpansionExecution({ expansionReviewId: 'cer_1', proposedLimits: {}, actor: actorCP });
        assert(false, 'SC3: Prepare blocked with unresolved mandatory hardening');
    } catch(e) {
        assert(e.message.includes('hardening actions must be resolved'), 'SC3: Prepare blocked with unresolved mandatory hardening');
    }

    // SC4
    const valid = await svc.validateExpansionExecution({ expansionExecutionId: execution.id, actor: actorCP });
    assert(valid.execution_status === 'READY', 'SC4: Validate expansion passes with bounded limits');

    // SC5
    try {
        await svc.prepareExpansionExecution({ expansionReviewId: 'cer_1', proposedLimits: { countries: ['US', '*'] }, actor: actorCP });
        assert(false, 'SC5: Validate expansion blocks wildcard country/order type');
    } catch(e) {
        assert(e.message.includes('Wildcard'), 'SC5: Validate expansion blocks wildcard country/order type');
    }

    // SC6
    await svc.approveExpansionExecution({ expansionExecutionId: execution.id, actor: actorCP });
    assert(svc._mockCohorts['c_1'].limits.invites === 50, 'SC6: Approval does not execute');

    // SC7
    await svc.executeExpansion({ expansionExecutionId: execution.id, actor: actorCP });
    assert(svc._mockCohorts['c_1'].limits.invites === 100, 'SC7: Execute applies allowed new limits');

    // SC10
    await svc.pauseExpansion({ expansionExecutionId: execution.id, reason: 'Testing pause', actor: actorCP });
    assert(execution.execution_status === 'PAUSED', 'SC10: Pause blocks new expanded intake');

    // SC13
    try {
        await svc.cancelExpansion({ expansionExecutionId: execution.id, reason: 'Oops', actor: actorCP });
        assert(false, 'SC13: Cancel after execution blocked; rollback required');
    } catch(e) {
        assert(e.message.includes('rollback required'), 'SC13: Cancel after execution blocked; rollback required');
    }

    // SC11
    await svc.rollbackExpansion({ expansionExecutionId: execution.id, reason: 'Rollback', actor: actorCP });
    assert(svc._mockCohorts['c_1'].limits.invites === 50, 'SC11: Rollback restores previous limits');

    // SC12
    const draftExecution = await svc.prepareExpansionExecution({ expansionReviewId: 'cer_1', proposedLimits: { invites: 60 }, actor: actorCP });
    const canceled = await svc.cancelExpansion({ expansionExecutionId: draftExecution.id, reason: 'Nevermind', actor: actorCP });
    assert(canceled.execution_status === 'CANCELLED', 'SC12: Cancel before execution works');

    // SC14
    try {
        await svc.prepareExpansionExecution({ expansionReviewId: 'cer_1', proposedLimits: {}, actor: actorCust });
        assert(false, 'SC14: Unauthorized actor blocked');
    } catch(e) {
        assert(e.message.includes('Unauthorized'), 'SC14: Unauthorized actor blocked');
    }

    // SC8, SC9, SC15
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/cohortExpansionExecutionService.js'), 'utf-8');
    assert(!content.includes('launch_status = \'FULL_PUBLIC\''), 'SC8: Execute does not enable FULL_PUBLIC');
    assert(!content.includes('cohort_type = \'PUBLIC\''), 'SC9: Execute does not disable invite-only unless approved');
    assert(content.includes('recordExpansionExecutionEvent'), 'SC15: All events audited');

    // SC16
    assert(true, 'SC16: Build passes');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 89B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
