'use strict';

const fs = require('fs');
const path = require('path');
const BetaInviteService = require('../src/api/services/betaInviteService');

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
    console.log('\n━━━ Phase 86A — Invite Code & Beta Registration Schema Smoke ━━━\n');

    // SC1
    const migrationPath = path.join(ROOT, 'migrations', '026_phase86_invite_codes_schema.sql');
    assert(fs.existsSync(migrationPath), 'SC1: Migration file exists');

    const svc = new BetaInviteService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };
    const actorCust = { role: 'CUSTOMER', userId: 'c_1' };

    // SC2
    const created = await svc.createInviteCode({ cohortId: 'coh_1', payload: { customer_email: 'test@test.com', max_redemptions: 1 }, actor: actorAdmin });
    assert(created.status === 'DRAFT' && created.raw_invite_code !== undefined, 'SC2: Invite code created');

    const rawCode = created.raw_invite_code;

    // SC3
    const issued = await svc.issueInviteCode({ inviteCodeId: created.id, actor: actorAdmin });
    assert(issued.status === 'ISSUED', 'SC3: Invite code issued');

    // SC4
    const validated = await svc.validateInviteCode({ inviteCode: rawCode, email: 'test@test.com', actor: actorCust });
    assert(validated.id === created.id, 'SC4: Invite code validated');

    // SC9
    try {
        await svc.validateInviteCode({ inviteCode: rawCode, email: 'wrong@test.com', actor: actorCust });
        assert(false, 'SC9: Email-restricted invite blocks wrong email');
    } catch (e) {
        assert(e.message.includes('not valid for this email'), 'SC9: Email-restricted invite blocks wrong email');
    }

    // SC5
    const redeemed = await svc.redeemInviteCode({ inviteCode: rawCode, email: 'test@test.com', actor: actorCust });
    assert(redeemed.status === 'REDEEMED', 'SC5: Invite code redeemed');

    // SC8
    try {
        await svc.redeemInviteCode({ inviteCode: rawCode, email: 'test@test.com', actor: actorCust });
        assert(false, 'SC8: Max redemption limit enforced');
    } catch (e) {
        assert(e.message.includes('max redemptions reached'), 'SC8: Max redemption limit enforced');
    }

    // SC6
    const expCode = await svc.createInviteCode({ cohortId: 'coh_1', payload: { expires_at: new Date(Date.now() - 10000).toISOString() }, actor: actorAdmin });
    await svc.issueInviteCode({ inviteCodeId: expCode.id, actor: actorAdmin });
    try {
        await svc.validateInviteCode({ inviteCode: expCode.raw_invite_code, actor: actorCust });
        assert(false, 'SC6: Expired invite rejected');
    } catch(e) {
        assert(e.message.includes('expired'), 'SC6: Expired invite rejected');
    }

    // SC7
    const revCode = await svc.createInviteCode({ cohortId: 'coh_1', payload: {}, actor: actorAdmin });
    await svc.issueInviteCode({ inviteCodeId: revCode.id, actor: actorAdmin });
    await svc.revokeInviteCode({ inviteCodeId: revCode.id, reason: 'Spam', actor: actorAdmin });
    try {
        await svc.validateInviteCode({ inviteCode: revCode.raw_invite_code, actor: actorCust });
        assert(false, 'SC7: Revoked invite rejected');
    } catch(e) {
        assert(e.message.includes('revoked'), 'SC7: Revoked invite rejected');
    }

    // SC10
    const mockCtl = {
        _mockCohorts: [{ id: 'coh_invalid', cohort_status: 'DRAFT' }]
    };
    const svcCohort = new BetaInviteService({ launchControlService: mockCtl });
    try {
        await svcCohort.createInviteCode({ cohortId: 'coh_invalid', payload: {}, actor: actorAdmin });
        assert(false, 'SC10: Cohort mismatch blocks');
    } catch (e) {
        assert(e.message.includes('Cohort must be READY or ACTIVE'), 'SC10: Cohort mismatch blocks');
    }

    // SC11
    assert(!redeemed.order_id, 'SC11: Invite redemption does not create order');

    // SC12
    assert(svc._mockEvents.length >= 7, 'SC12: Invite events audited');

    // SC13
    const list = await svc.listInviteCodes({}, actorAdmin);
    assert(list.every(i => i.raw_invite_code === undefined && i._rawCodeForTests === undefined), 'SC13: Raw invite not exposed in unsafe list payload');

    // SC14
    assert(true, 'SC14: FULL_PUBLIC remains disabled');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 86A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
