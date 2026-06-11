'use strict';

const fs = require('fs');
const path = require('path');
const MarketplaceLaunchWorkflowService = require('../src/api/services/marketplaceLaunchWorkflowService');
const MarketplaceLaunchControlService = require('../src/api/services/marketplaceLaunchControlService');
const MarketplaceLaunchReadinessService = require('../src/api/services/marketplaceLaunchReadinessService');

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
    console.log('\n━━━ Phase 85C — Launch Approval / Rollout Cohort Workflow Smoke ━━━\n');

    const ctlSvc = new MarketplaceLaunchControlService();
    const rdSvc = new MarketplaceLaunchReadinessService();
    const wfSvc = new MarketplaceLaunchWorkflowService({
        launchControlService: ctlSvc,
        launchReadinessService: rdSvc
    });

    const actorOps = { role: 'OPS_ADMIN', userId: 'u_1' };
    const actorCP = { role: 'CONTROL_PLANE_ADMIN', userId: 'u_2' };
    const actorPartner = { role: 'PRINTHOUSE_ADMIN', userId: 'u_3' };

    // SC1
    const s1 = await wfSvc.submitLaunchReviewRequest({ actor: actorOps, justification: 'Testing' });
    assert(s1.launch_status === 'READINESS_REVIEW', 'SC1: OPS_ADMIN can request launch review');

    // SC2
    try {
        await wfSvc.approveMarketplaceLaunch({ actor: actorPartner, approvalPayload: {} });
        assert(false, 'SC2: Partner cannot request launch approval');
    } catch(err) {
        assert(err.message.includes('Unauthorized'), 'SC2: Partner cannot request launch approval');
    }

    // SC3, SC4, SC5
    const s2 = await wfSvc.approveMarketplaceLaunch({ actor: actorCP, approvalPayload: { ok: true } });
    assert(s2.launch_status === 'APPROVED', 'SC3: CONTROL_PLANE_ADMIN can approve limited rollout');
    assert(s2.approval_snapshot_json.readiness_snapshot !== undefined, 'SC4: Approval stores readiness snapshot');
    assert(s2.public_marketplace_launch_enabled === false, 'SC5: Approval does not activate public launch');

    // SC6
    try {
        await wfSvc.activateLimitedRollout({ cohortId: 'non_existent', actor: actorCP });
        assert(false, 'SC6: Activation requires active cohort');
    } catch (err) {
        assert(err.message.includes('Active cohort required'), 'SC6: Activation requires active cohort');
    }

    // Setup active cohort
    const cohort = await ctlSvc.createLaunchCohort({ payload: { cohort_name: 'test' }, actor: actorCP });
    await ctlSvc.activateLaunchCohort({ cohortId: cohort.id, actor: actorCP });

    // SC7, SC8
    const s3 = await wfSvc.activateLimitedRollout({ cohortId: cohort.id, actor: actorCP });
    assert(s3.public_marketplace_launch_enabled === true && s3.launch_scope === 'LIMITED_PUBLIC', 'SC7: Activation sets limited rollout flags only');
    assert(s3.launch_scope !== 'FULL_PUBLIC', 'SC8: Full public not enabled during limited rollout');

    // SC9
    const s4 = await wfSvc.triggerMarketplaceEmergencyStop({ actor: actorCP, reason: 'Test' });
    assert(s4.public_marketplace_launch_enabled === false, 'SC9: Emergency stop disables public flags');

    // SC11
    rdSvc.mockState.artifact_trust_active = false; // Break readiness
    try {
        await wfSvc.resumeMarketplaceLaunch({ actor: actorCP });
        assert(false, 'SC11: Resume requires fresh readiness');
    } catch(err) {
        assert(err.message.includes('Fresh readiness fails'), 'SC11: Resume requires fresh readiness');
    }
    rdSvc.mockState.artifact_trust_active = true;
    const s5 = await wfSvc.resumeMarketplaceLaunch({ actor: actorCP });
    assert(s5.launch_status === 'LIMITED_PUBLIC_ROLLOUT', 'SC11: Resume succeeds when readiness passes');

    // SC10
    const s6 = await wfSvc.rollbackMarketplaceLaunch({ actor: actorCP, reason: 'Abort' });
    assert(s6.public_marketplace_launch_enabled === false, 'SC10: Rollback disables public flags');

    // SC12
    try {
        await wfSvc.pauseMarketplaceLaunch({ actor: { role: 'CUSTOMER' }, reason: '' });
        assert(false, 'SC12: Unauthorized role blocked');
    } catch(err) {
        assert(err.message.includes('Unauthorized'), 'SC12: Unauthorized role blocked');
    }

    // SC13, SC14
    const timeline = await wfSvc.getLaunchWorkflowTimeline(actorOps);
    assert(Array.isArray(timeline) && timeline.length >= 6, 'SC13: Workflow timeline complete');
    assert(timeline.some(e => e.event_type === 'LAUNCH_ROLLED_BACK'), 'SC14: All transitions audited');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 85C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
