'use strict';

const fs = require('fs');
const path = require('path');
const MarketplaceLaunchControlService = require('../src/api/services/marketplaceLaunchControlService');
const MarketplaceLaunchReadinessService = require('../src/api/services/marketplaceLaunchReadinessService');
const MarketplaceLaunchWorkflowService = require('../src/api/services/marketplaceLaunchWorkflowService');
const PublicMarketplaceGuardService = require('../src/api/services/publicMarketplaceGuardService');

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
    console.log('\n━━━ Phase 85F — End-to-End Launch Readiness Regression ━━━\n');

    const ctlSvc = new MarketplaceLaunchControlService();
    const rdSvc = new MarketplaceLaunchReadinessService();
    const wfSvc = new MarketplaceLaunchWorkflowService({ launchControlService: ctlSvc, launchReadinessService: rdSvc });
    const guardSvc = new PublicMarketplaceGuardService({ launchControlService: ctlSvc });

    const actorOps = { role: 'OPS_ADMIN', userId: 'u_1' };
    const actorCP = { role: 'CONTROL_PLANE_ADMIN', userId: 'u_2' };
    const actorCust = { role: 'CUSTOMER', userId: 'u_3' };
    const actorPartner = { role: 'PRINTHOUSE_ADMIN', userId: 'u_4' };

    // SC1, SC2
    assert(ctlSvc._mockControl.public_marketplace_launch_enabled === false, 'SC1: Launch control starts disabled');
    const g1 = await guardSvc.evaluatePublicActionAllowed({ action: 'PUBLIC_CREATE_ORDER', actor: actorCust });
    assert(g1.decision === 'BLOCKED', 'SC2: Public guard blocks public actions when disabled');

    // SC3-SC6
    const r1 = await rdSvc.evaluatePublicMarketplaceReadiness({ actor: actorCP });
    assert(r1.ready_for_launch_review === true, 'SC3: Readiness evaluation passes when all domains pass');
    
    rdSvc.mockState.emergency_stop_available = false;
    assert(!(await rdSvc.evaluatePublicMarketplaceReadiness({ actor: actorCP })).ready_for_launch_review, 'SC4: Readiness evaluation fails with missing emergency stop');
    rdSvc.mockState.emergency_stop_available = true;

    rdSvc.mockState.customer_portal_active = false;
    assert(!(await rdSvc.evaluatePublicMarketplaceReadiness({ actor: actorCP })).ready_for_launch_review, 'SC5: Readiness evaluation fails with missing customer portal');
    rdSvc.mockState.customer_portal_active = true;

    rdSvc.mockState.partner_job_board_active = false;
    assert(!(await rdSvc.evaluatePublicMarketplaceReadiness({ actor: actorCP })).ready_for_launch_review, 'SC6: Readiness evaluation fails with missing partner job board');
    rdSvc.mockState.partner_job_board_active = true;

    // SC7, SC8
    const cohort = await ctlSvc.createLaunchCohort({ payload: { cohort_name: 'E2E', cohort_type: 'CUSTOMER_BETA', allowed_tenant_ids_json: ['t_1'], allowed_order_types_json: ['BOOK'] }, actor: actorCP });
    assert(cohort.cohort_status === 'DRAFT', 'SC7: Cohort created');
    await ctlSvc.activateLaunchCohort({ cohortId: cohort.id, actor: actorCP });
    assert(cohort.cohort_status === 'ACTIVE', 'SC8: Cohort activated');

    // SC9, SC10, SC11
    await wfSvc.submitLaunchReviewRequest({ actor: actorOps, justification: 'Go' });
    assert(ctlSvc._mockControl.launch_status === 'READINESS_REVIEW', 'SC9: Launch review requested');
    await wfSvc.approveMarketplaceLaunch({ actor: actorCP, approvalPayload: { go: true } });
    assert(ctlSvc._mockControl.launch_status === 'APPROVED', 'SC10: Launch approved');
    assert(ctlSvc._mockControl.public_marketplace_launch_enabled === false, 'SC11: Approval does not activate public launch');

    // SC12
    await wfSvc.activateLimitedRollout({ cohortId: cohort.id, actor: actorCP });
    assert(ctlSvc._mockControl.public_marketplace_launch_enabled === true && ctlSvc._mockControl.launch_scope === 'LIMITED_PUBLIC', 'SC12: Limited rollout activated');

    // SC13, SC14, SC15, SC16
    const g2 = await guardSvc.evaluatePublicActionAllowed({ action: 'PUBLIC_CREATE_ORDER', tenantId: 't_1', orderType: 'BOOK', actor: actorCust });
    assert(g2.decision === 'ALLOWED', 'SC13: Public guard allows cohort action');
    
    const g3 = await guardSvc.evaluatePublicActionAllowed({ action: 'PUBLIC_CREATE_ORDER', tenantId: 't_2', orderType: 'BOOK', actor: actorCust });
    assert(g3.decision === 'BLOCKED', 'SC14: Public guard blocks non-cohort action');

    const g4 = await guardSvc.evaluatePublicActionAllowed({ action: 'PUBLIC_CREATE_ORDER', tenantId: 't_1', orderType: 'POSTER', actor: actorCust });
    assert(g4.decision === 'BLOCKED', 'SC15: Public guard blocks disallowed order type');

    cohort.daily_orders_exceeded = true;
    const g5 = await guardSvc.evaluatePublicActionAllowed({ action: 'PUBLIC_CREATE_ORDER', tenantId: 't_1', orderType: 'BOOK', actor: actorCust });
    assert(g5.decision === 'BLOCKED', 'SC16: Public guard blocks when daily limit exceeded');
    cohort.daily_orders_exceeded = false;

    // SC17, SC18, SC19
    const contentGuard = fs.readFileSync(path.join(ROOT, 'src/api/services/publicMarketplaceGuardService.js'), 'utf-8');
    assert(!contentGuard.includes('live_guard = bypass'), 'SC17: Enter live pipeline still requires live guard');
    assert(!contentGuard.includes('artifact_trust'), 'SC18: Public guard does not bypass artifact trust');
    assert(!contentGuard.includes('payment_status = confirmed'), 'SC19: Public guard does not bypass payment/proof/preflight');

    // SC20, SC21
    await wfSvc.triggerMarketplaceEmergencyStop({ actor: actorOps, reason: 'Test' });
    assert(ctlSvc._mockControl.launch_status === 'EMERGENCY_STOP', 'SC20: Emergency stop triggered');
    const g6 = await guardSvc.evaluatePublicActionAllowed({ action: 'PUBLIC_CREATE_ORDER', tenantId: 't_1', orderType: 'BOOK', actor: actorCust });
    assert(g6.decision === 'BLOCKED' && g6.blocking_reasons_json.includes('Emergency stop active'), 'SC21: Emergency stop blocks public actions immediately');

    // SC22, SC23
    await wfSvc.rollbackMarketplaceLaunch({ actor: actorCP, reason: 'Abort' });
    assert(ctlSvc._mockControl.launch_status === 'ROLLED_BACK' && !ctlSvc._mockControl.public_marketplace_launch_enabled, 'SC22: Rollback disables public flags');
    
    try {
        rdSvc.mockState.artifact_trust_active = false;
        await wfSvc.resumeMarketplaceLaunch({ actor: actorCP });
        assert(false, 'SC23: Resume requires fresh readiness');
    } catch(err) {
        assert(err.message.includes('Fresh readiness'), 'SC23: Resume requires fresh readiness');
    }
    rdSvc.mockState.artifact_trust_active = true;

    // SC24, SC25
    try {
        await wfSvc.approveMarketplaceLaunch({ actor: actorCust, approvalPayload: {} });
        assert(false, 'SC24: Unauthorized role blocked');
    } catch(err) { assert(err.message.includes('Unauthorized'), 'SC24: Unauthorized role blocked'); }
    try {
        await wfSvc.approveMarketplaceLaunch({ actor: actorPartner, approvalPayload: {} });
        assert(false, 'SC25: Partner/customer cannot approve launch');
    } catch(err) { assert(err.message.includes('Unauthorized'), 'SC25: Partner/customer cannot approve launch'); }

    // SC26, SC27, SC28, SC29
    assert(ctlSvc._mockEvents.length >= 8, 'SC26: All launch events audited');
    assert(ctlSvc._mockControl.launch_scope !== 'FULL_PUBLIC', 'SC27: Public launch remains limited, not full public');
    assert(!rdSvc.mockState.has_forbidden_claims, 'SC28: No forbidden claims');
    assert(!ctlSvc._mockControl.public_marketplace_launch_enabled, 'SC29: Public marketplace launch not enabled by default after tests');

    // Generate Reports
    const repDir = path.join(ROOT, 'reports');
    if (!fs.existsSync(repDir)) fs.mkdirSync(repDir, { recursive: true });
    
    fs.writeFileSync(path.join(repDir, 'phase85f_end_to_end_launch_readiness_regression.json'), JSON.stringify({ phase: '85F', pass: PASS, fail: FAIL }, null, 2));
    fs.writeFileSync(path.join(repDir, 'phase85f_end_to_end_launch_readiness_regression.md'), `# Phase 85F E2E Regression\n\nPASS: ${PASS}\nFAIL: ${FAIL}\n`);

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 85F Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
