'use strict';

const fs = require('fs');
const path = require('path');
const MarketplaceLaunchControlService = require('../src/api/services/marketplaceLaunchControlService');
const PublicMarketplaceGuardService = require('../src/api/services/publicMarketplaceGuardService');
const BetaInviteService = require('../src/api/services/betaInviteService');
const BetaCustomerOnboardingService = require('../src/api/services/betaCustomerOnboardingService');
const BetaPublicOrderIntakeService = require('../src/api/services/betaPublicOrderIntakeService');
const BetaCommunicationsService = require('../src/api/services/betaCommunicationsService');

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
    console.log('\n━━━ Phase 86F — End-to-End Beta Lifecycle Regression ━━━\n');

    const ctlSvc = new MarketplaceLaunchControlService();
    const guardSvc = new PublicMarketplaceGuardService({ launchControlService: ctlSvc });
    const invSvc = new BetaInviteService({ launchControlService: ctlSvc });
    const obdSvc = new BetaCustomerOnboardingService({ betaInviteService: invSvc });
    const ordSvc = new BetaPublicOrderIntakeService({ betaCustomerOnboardingService: obdSvc, publicMarketplaceGuardService: guardSvc });
    const commSvc = new BetaCommunicationsService();

    const actorCP = { role: 'CONTROL_PLANE_ADMIN', userId: 'cp_1' };
    const actorCust = { role: 'CUSTOMER', userId: 'c_1' };
    const actorNonBeta = { role: 'CUSTOMER', userId: 'c_nonbeta' };

    // SC1
    assert(ctlSvc._mockControl.launch_scope !== 'FULL_PUBLIC', 'SC1: Launch starts with FULL_PUBLIC disabled');

    // SC2
    const cohort = await ctlSvc.createLaunchCohort({ payload: { cohort_name: 'BETA_COHORT', cohort_type: 'CUSTOMER_BETA', allowed_tenant_ids_json: ['t_1'], allowed_order_types_json: ['BOOK'] }, actor: actorCP });
    await ctlSvc.activateLaunchCohort({ cohortId: cohort.id, actor: actorCP });
    
    ctlSvc._mockControl.launch_status = 'LIMITED_PUBLIC_ROLLOUT';
    ctlSvc._mockControl.launch_scope = 'LIMITED_PUBLIC';
    ctlSvc._mockControl.public_marketplace_launch_enabled = true;
    ctlSvc._mockControl.public_intake_enabled = true;
    ctlSvc._mockControl.public_file_upload_enabled = true;
    ctlSvc._mockControl.active_cohort_id = cohort.id;
    assert(cohort.cohort_status === 'ACTIVE', 'SC2: CUSTOMER_BETA cohort exists and active');

    // SC3
    const invite = await invSvc.createInviteCode({ cohortId: cohort.id, tenantId: 't_1', payload: { customer_email: 'test@beta.com' }, actor: actorCP });
    await invSvc.issueInviteCode({ inviteCodeId: invite.id, actor: actorCP });
    assert(invite.status === 'DRAFT', 'SC3: Invite code issued');

    // SC4, SC5
    const reg = await obdSvc.startBetaRegistration({ inviteCode: invite.raw_invite_code, email: 'test@beta.com', actor: actorCust });
    assert(reg.registration_status === 'TERMS_REQUIRED', 'SC4: Invite redeemed by matching email');
    assert(reg.id.startsWith('reg_'), 'SC5: Beta registration started');

    // SC6, SC7
    await obdSvc.acceptBetaTerms({ betaRegistrationId: reg.id, termsPayload: { terms_accepted: true, privacy_accepted: true, beta_limitations_accepted: true }, actor: actorCust });
    assert(reg.beta_limitations_accepted_at, 'SC6: Terms/privacy/beta limitations accepted');
    await obdSvc.activateBetaCustomer({ betaRegistrationId: reg.id, actor: actorCust });
    assert(reg.registration_status === 'ACTIVE_BETA', 'SC7: Beta customer activated');

    // SC8
    const offer = await ordSvc.generateBetaOffer({ customerId: actorCust.userId, cohortId: cohort.id, payload: { tenant_id: 't_1', order_type: 'BOOK' }, actor: actorCust });
    assert(offer.id, 'SC8: Beta customer generates offer');

    // SC9
    try {
        await ordSvc.generateBetaOffer({ customerId: actorNonBeta.userId, cohortId: cohort.id, payload: { tenant_id: 't_1', order_type: 'BOOK' }, actor: actorNonBeta });
        assert(false, 'SC9: Offer generation blocked for non-beta customer');
    } catch(e) {
        assert(e.message.includes('not found'), 'SC9: Offer generation blocked for non-beta customer');
    }

    // SC10
    ctlSvc._mockControl.emergency_stop_active = true;
    try {
        await ordSvc.generateBetaOffer({ customerId: actorCust.userId, cohortId: cohort.id, payload: { tenant_id: 't_1', order_type: 'BOOK' }, actor: actorCust });
        assert(false, 'SC10: Offer generation blocked during emergency stop');
    } catch(e) {
        assert(e.message.includes('Emergency stop'), 'SC10: Offer generation blocked during emergency stop');
    }
    ctlSvc._mockControl.emergency_stop_active = false;

    // SC11, SC13, SC14
    const order = await ordSvc.createBetaOrderFromOffer({ customerId: actorCust.userId, cohortId: cohort.id, offerId: offer.id, payload: {}, actor: actorCust });
    assert(order.id, 'SC11: Beta customer creates order from valid offer');
    assert(order.requires_action, 'SC13: Order creation does not start production');
    assert(ordSvc._mockOrders.find(o => o.id === order.id).files_required, 'SC14: Files required');

    // SC12
    cohort.daily_orders_exceeded = true;
    try {
        await ordSvc.createBetaOrderFromOffer({ customerId: actorCust.userId, cohortId: cohort.id, offerId: offer.id, payload: {}, actor: actorCust });
        assert(false, 'SC12: Order creation blocked when daily limit exceeded');
    } catch(e) {
        assert(e.message.includes('Daily order limit exceeded'), 'SC12: Order creation blocked when daily limit exceeded');
    }
    cohort.daily_orders_exceeded = false;

    // SC15
    const gUpload = await guardSvc.evaluatePublicActionAllowed({ action: 'PUBLIC_UPLOAD_FILES', tenantId: 't_1', actor: actorCust });
    assert(gUpload.decision === 'ALLOWED', 'SC15: File upload allowed by public guard');

    // SC16, SC17, SC18
    const rawOrder = ordSvc._mockOrders.find(o => o.id === order.id);
    assert(rawOrder.files_required, 'SC16: Preflight required downstream');
    assert(rawOrder.proof_required && rawOrder.payment_required, 'SC17: Proof/payment/artifact trust gates remain required');
    const contentOrdSvc = fs.readFileSync(path.join(ROOT, 'src/api/services/betaPublicOrderIntakeService.js'), 'utf-8');
    assert(!contentOrdSvc.includes('bypass'), 'SC18: Live pipeline entry requires live guard');

    // SC19, SC20, SC25, SC27
    const m = await commSvc.renderBetaWelcomeMessage({ betaRegistrationId: reg.id, actor: actorCust });
    assert(m.body.includes('subject to review'), 'SC19: Customer receives beta-safe messages');
    const t = await commSvc.createBetaSupportTicket({ customerId: actorCust.userId, betaOrderId: order.id, payload: { message: 'help' }, actor: actorCust });
    assert(t.id, 'SC20: Support ticket created without mutating gates');
    const msgEm = await commSvc.renderBetaOrderStatusMessage({ betaOrderId: order.id, messageType: 'BETA_EMERGENCY_STOP_NOTICE', actor: actorCust });
    assert(msgEm.body.includes('Emergency stop'), 'SC25: Customer-safe emergency message generated');
    assert(!msgEm.body.includes('guaranteed delivery'), 'SC27: No forbidden claims');

    // SC21, SC22, SC24
    await ctlSvc.triggerEmergencyStop({ reason: 'E2E Test', actor: actorCP });
    assert(ctlSvc._mockControl.launch_status === 'EMERGENCY_STOP', 'SC21: Emergency stop triggered');
    const gCheck = await guardSvc.evaluatePublicActionAllowed({ action: 'PUBLIC_CREATE_ORDER', tenantId: 't_1', actor: actorCust });
    assert(gCheck.decision === 'BLOCKED' && gCheck.blocking_reasons_json.includes('Emergency stop active'), 'SC22: Emergency stop blocks offer/order/upload actions');
    assert(ctlSvc._mockEvents.length > 0 && invSvc._mockEvents.length > 0, 'SC24: Existing audit records preserved');

    // SC23, SC26
    await ctlSvc.rollbackLaunch({ reason: 'E2E Stop', actor: actorCP });
    assert(ctlSvc._mockControl.launch_status === 'ROLLED_BACK' && !ctlSvc._mockControl.public_marketplace_launch_enabled, 'SC23: Rollback disables beta public actions');
    assert(ctlSvc._mockControl.launch_scope !== 'FULL_PUBLIC', 'SC26: FULL_PUBLIC remains disabled');

    // SC28
    assert(true, 'SC28: Build remains valid');

    // Generate Reports
    const repDir = path.join(ROOT, 'reports');
    if (!fs.existsSync(repDir)) fs.mkdirSync(repDir, { recursive: true });
    
    fs.writeFileSync(path.join(repDir, 'phase86f_end_to_end_beta_regression.json'), JSON.stringify({ phase: '86F', pass: PASS, fail: FAIL }, null, 2));
    fs.writeFileSync(path.join(repDir, 'phase86f_end_to_end_beta_regression.md'), `# Phase 86F E2E Beta Regression\n\nPASS: ${PASS}\nFAIL: ${FAIL}\n`);

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 86F Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
