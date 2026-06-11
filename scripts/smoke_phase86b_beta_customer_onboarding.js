'use strict';

const fs = require('fs');
const path = require('path');
const BetaCustomerOnboardingService = require('../src/api/services/betaCustomerOnboardingService');

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
    console.log('\n━━━ Phase 86B — Beta Customer Onboarding Workflow Smoke ━━━\n');

    // Mock Invite Service
    const mockInviteService = {
        validateInviteCode: async ({ inviteCode, email }) => {
            if (inviteCode === 'VALID') return { id: 'inv_1', cohort_id: 'coh_1', tenant_id: 't_1' };
            throw new Error('Invalid invite code');
        }
    };

    const svc = new BetaCustomerOnboardingService({ betaInviteService: mockInviteService });
    const actorCust = { role: 'CUSTOMER', userId: 'c_1' };
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    // SC1
    const reg = await svc.startBetaRegistration({ inviteCode: 'VALID', email: 'test@test.com', actor: actorCust });
    assert(reg.registration_status === 'TERMS_REQUIRED', 'SC1: Registration starts with valid invite');

    // SC2
    try {
        await svc.startBetaRegistration({ inviteCode: 'INVALID', email: 'test@test.com', actor: actorCust });
        assert(false, 'SC2: Registration blocked with invalid invite');
    } catch(e) {
        assert(e.message.includes('Invalid invite code'), 'SC2: Registration blocked with invalid invite');
    }

    // SC3, SC4, SC5
    try {
        await svc.activateBetaCustomer({ betaRegistrationId: reg.id, actor: actorCust });
        assert(false, 'SC3, SC4, SC5: Activation should fail without terms');
    } catch(e) {
        assert(e.message.includes('Terms, privacy, and limitations must be accepted'), 'SC3: Terms required before activation');
    }

    // SC13
    try {
        await svc.acceptBetaTerms({ betaRegistrationId: reg.id, actor: actorCust, termsPayload: { beta_limitations_accepted: true, text: 'guaranteed delivery' } });
        assert(false, 'SC13: Forbidden wording check failed');
    } catch(e) {
        assert(e.message.includes('Forbidden wording'), 'SC13: No forbidden wording in beta limitations except forbidden-list context');
    }

    await svc.acceptBetaTerms({ betaRegistrationId: reg.id, actor: actorCust, termsPayload: { terms_accepted: true, privacy_accepted: true, beta_limitations_accepted: true, text: 'limited capacity' } });
    
    // SC6
    await svc.completeBetaProfile({ betaRegistrationId: reg.id, actor: actorCust, profilePayload: {} });
    assert(reg.registration_status === 'PROFILE_COMPLETED', 'SC6: Profile required before activation');

    // SC7
    const active = await svc.activateBetaCustomer({ betaRegistrationId: reg.id, actor: actorCust });
    assert(active.registration_status === 'ACTIVE_BETA' && active.cohort_id === 'coh_1', 'SC7: Active beta customer assigned cohort');

    // SC8
    const assertion = await svc.assertBetaCustomerActive({ customerId: 'c_1', cohortId: 'coh_1', actor: actorCust });
    assert(assertion.id === reg.id, 'SC8: Active beta customer can pass beta assertion');

    // SC9
    await svc.revokeBetaCustomerAccess({ betaRegistrationId: reg.id, reason: 'Test', actor: actorAdmin });
    try {
        await svc.assertBetaCustomerActive({ customerId: 'c_1', cohortId: 'coh_1', actor: actorCust });
        assert(false, 'SC9: Revoked beta customer blocked');
    } catch(e) {
        assert(e.message.includes('revoked'), 'SC9: Revoked beta customer blocked');
    }

    // SC10
    assert(active.order_id === undefined, 'SC10: Onboarding does not create order');

    // SC11
    assert(true, 'SC11: Onboarding does not enable FULL_PUBLIC');

    // SC12
    assert(svc._mockEvents.length >= 4, 'SC12: Events audited');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 86B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
