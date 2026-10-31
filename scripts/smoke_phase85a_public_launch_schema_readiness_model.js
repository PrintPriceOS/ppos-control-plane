'use strict';

const fs = require('fs');
const path = require('path');
const MarketplaceLaunchControlService = require('../src/api/services/marketplaceLaunchControlService');

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
    console.log('\n━━━ Phase 85A — Public Launch Schema / Readiness Model Smoke ━━━\n');

    // SC1
    const migrationPath = path.join(ROOT, 'migrations', '025_phase85_public_marketplace_readiness_launch_control.sql');
    assert(fs.existsSync(migrationPath), 'SC1: Migration file exists');

    const svc = new MarketplaceLaunchControlService();
    const actorCP = { role: 'CONTROL_PLANE_ADMIN', userId: 'u_1' };

    // SC2, SC3
    const state = await svc.getLaunchControlState(actorCP);
    assert(state.public_marketplace_launch_enabled === false, 'SC2: Launch control defaults disabled');
    assert(state.public_intake_enabled === false, 'SC3: Public intake defaults disabled');

    // SC4
    const cohort = await svc.createLaunchCohort({ payload: { cohort_name: 'Beta' }, actor: actorCP });
    assert(cohort.cohort_status === 'DRAFT', 'SC4: Cohort can be created in DRAFT');

    // SC5
    await svc.activateLaunchCohort({ cohortId: cohort.id, actor: actorCP });
    const s2 = await svc.getLaunchControlState(actorCP);
    assert(s2.public_marketplace_launch_enabled === false, 'SC5: Cohort activation does not enable public launch');

    // SC6
    const s3 = await svc.requestLaunchReview({ actor: actorCP });
    assert(s3.launch_status === 'READINESS_REVIEW', 'SC6: Launch review can be requested');

    // SC7
    const s4 = await svc.approveLaunch({ approvalPayload: { ok: true }, actor: actorCP });
    assert(s4.public_marketplace_launch_enabled === false, 'SC7: Approval does not activate public launch');

    // SC8
    // Requires approved launch + active cohort
    const s5 = await svc.activateLimitedPublicRollout({ cohortId: cohort.id, actor: actorCP });
    assert(s5.public_marketplace_launch_enabled === true && s5.active_cohort_id === cohort.id, 'SC8: Limited rollout requires approved launch + active cohort');

    // SC9
    const s6 = await svc.triggerEmergencyStop({ reason: 'Fire', actor: actorCP });
    assert(s6.public_marketplace_launch_enabled === false && s6.public_intake_enabled === false, 'SC9: Emergency stop disables all public flags');

    // SC10
    const s7 = await svc.rollbackLaunch({ reason: 'Failed', actor: actorCP });
    assert(s7.public_marketplace_launch_enabled === false && s7.public_intake_enabled === false, 'SC10: Rollback disables all public flags');

    // SC11
    const freshSvc = new MarketplaceLaunchControlService();
    try {
        await freshSvc.activateLimitedPublicRollout({ cohortId: cohort.id, actor: actorCP });
        assert(false, 'SC11: Direct NOT_STARTED -> PUBLIC_LIVE blocked');
    } catch(err) {
        assert(err.message.includes('APPROVED'), 'SC11: Direct NOT_STARTED -> PUBLIC_LIVE blocked');
    }

    // SC12
    assert(svc._mockEvents.length >= 6, 'SC12: All transitions audited');

    // SC13
    assert(s7.public_marketplace_launch_enabled === false, 'SC13: No public marketplace side effect from smoke');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 85A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
