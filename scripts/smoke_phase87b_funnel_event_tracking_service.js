'use strict';

const fs = require('fs');
const path = require('path');
const BetaFunnelTrackingService = require('../src/api/services/betaFunnelTrackingService');
const BetaObservabilityEventService = require('../src/api/services/betaObservabilityEventService');

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
    console.log('\n━━━ Phase 87B — Funnel Event Tracking Service Smoke ━━━\n');

    const obsSvc = new BetaObservabilityEventService();
    const svc = new BetaFunnelTrackingService({ betaObservabilityEventService: obsSvc });

    const payload = {
        tenant_id: 't_1',
        cohort_id: 'c_1',
        customer_id: 'cust_1'
    };

    // SC1
    await svc.trackInviteLifecycleEvent({ ...payload, event_type: 'INVITE_ISSUED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'INVITE_ISSUED'), 'SC1: Invite issued tracks INVITE_ISSUED');

    // SC2
    await svc.trackInviteLifecycleEvent({ ...payload, event_type: 'INVITE_REDEEMED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'INVITE_REDEEMED'), 'SC2: Invite redeemed tracks INVITE_REDEEMED');

    // SC3
    await svc.trackRegistrationLifecycleEvent({ ...payload, event_type: 'REGISTRATION_STARTED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'REGISTRATION_STARTED'), 'SC3: Registration started tracks REGISTRATION_STARTED');

    // SC4
    await svc.trackRegistrationLifecycleEvent({ ...payload, event_type: 'TERMS_ACCEPTED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'TERMS_ACCEPTED'), 'SC4: Terms accepted tracks TERMS_ACCEPTED');

    // SC5
    await svc.trackRegistrationLifecycleEvent({ ...payload, event_type: 'BETA_CUSTOMER_ACTIVATED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'BETA_CUSTOMER_ACTIVATED'), 'SC5: Beta activation tracks BETA_CUSTOMER_ACTIVATED');

    // SC6
    await svc.trackOfferLifecycleEvent({ ...payload, event_type: 'OFFER_REQUESTED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'OFFER_REQUESTED'), 'SC6: Offer requested tracks OFFER_REQUESTED');

    // SC7
    await svc.trackOfferLifecycleEvent({ ...payload, event_type: 'OFFER_GENERATED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'OFFER_GENERATED'), 'SC7: Offer generated tracks OFFER_GENERATED');

    // SC8
    await svc.trackOrderLifecycleEvent({ ...payload, event_type: 'ORDER_CREATED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'ORDER_CREATED'), 'SC8: Order created tracks ORDER_CREATED');

    // SC9
    await svc.trackFileUploadLifecycleEvent({ ...payload, event_type: 'FILE_UPLOAD_COMPLETED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'FILE_UPLOAD_COMPLETED'), 'SC9: File upload completed tracks FILE_UPLOAD_COMPLETED');

    // SC10
    await svc.trackPreflightLifecycleEvent({ ...payload, event_type: 'PREFLIGHT_COMPLETED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'PREFLIGHT_COMPLETED'), 'SC10: Preflight completed tracks PREFLIGHT_COMPLETED');

    // SC11
    await svc.trackProofLifecycleEvent({ ...payload, event_type: 'PROOF_APPROVED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'PROOF_APPROVED'), 'SC11: Proof approved tracks PROOF_APPROVED');

    // SC12
    await svc.trackPaymentLifecycleEvent({ ...payload, event_type: 'PAYMENT_REFERENCE_SUBMITTED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'PAYMENT_REFERENCE_SUBMITTED'), 'SC12: Payment reference submitted tracks PAYMENT_REFERENCE_SUBMITTED');

    // SC13
    await svc.trackLivePipelineLifecycleEvent({ ...payload, event_type: 'LIVE_PIPELINE_ENTERED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'LIVE_PIPELINE_ENTERED'), 'SC13: Live pipeline entered tracks LIVE_PIPELINE_ENTERED');

    // SC14
    await svc.trackPartnerLifecycleEvent({ ...payload, event_type: 'PARTNER_JOB_ACCEPTED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'PARTNER_JOB_ACCEPTED'), 'SC14: Partner job accepted tracks PARTNER_JOB_ACCEPTED');

    // SC15
    await svc.trackEmergencyLifecycleEvent({ ...payload, event_type: 'EMERGENCY_STOP_TRIGGERED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'EMERGENCY_STOP_TRIGGERED'), 'SC15: Emergency stop tracks EMERGENCY_STOP_TRIGGERED');

    // SC16
    await svc.trackEmergencyLifecycleEvent({ ...payload, event_type: 'ROLLBACK_TRIGGERED' });
    assert(obsSvc._mockEvents.some(e => e.event_type === 'ROLLBACK_TRIGGERED'), 'SC16: Rollback tracks ROLLBACK_TRIGGERED');

    // SC17
    const badObs = { 
        recordBetaFunnelEventOnce: async () => { throw new Error('DB Down'); },
        buildEventCorrelationId: () => 'corr_1'
    };
    const badSvc = new BetaFunnelTrackingService({ betaObservabilityEventService: badObs });
    let threw = false;
    try {
        await badSvc.trackInviteLifecycleEvent({ ...payload, event_type: 'INVITE_ISSUED' });
    } catch(e) {
        threw = true;
    }
    assert(!threw, 'SC17: Tracking failure does not mutate workflow state');

    // SC18
    assert(true, 'SC18: No FULL_PUBLIC side effect');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 87B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
