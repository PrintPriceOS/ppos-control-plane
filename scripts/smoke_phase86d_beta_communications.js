'use strict';

const fs = require('fs');
const path = require('path');
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
    console.log('\n━━━ Phase 86D — Beta Communications & Support Smoke ━━━\n');

    const svc = new BetaCommunicationsService();
    const actorCust = { role: 'CUSTOMER', userId: 'c_1' };

    // SC1
    const m1 = await svc.renderInviteEmail({ inviteCodeId: 'inv_1', actor: actorCust });
    assert(m1.body.includes('invite-only') && m1.body.includes('limited'), 'SC1: Invite email rendered safely');

    // SC2
    const m2 = await svc.renderBetaWelcomeMessage({ betaRegistrationId: 'reg_1', actor: actorCust });
    assert(m2.body.includes('subject to review'), 'SC2: Welcome message rendered');

    // SC3
    const m3 = await svc.renderBetaLimitationsMessage({ betaRegistrationId: 'reg_1', actor: actorCust });
    assert(m3.body.includes('Limitations'), 'SC3: Limitations message rendered');

    // SC4
    const m4 = await svc.renderBetaOrderStatusMessage({ betaOrderId: 'bord_1', messageType: 'BETA_ORDER_RECEIVED', actor: actorCust });
    assert(m4.body.includes('Order received'), 'SC4: Order received message rendered');

    // SC5
    const m5 = await svc.renderBetaOrderStatusMessage({ betaOrderId: 'bord_1', messageType: 'BETA_ACTION_REQUIRED', actor: actorCust });
    assert(m5.body.includes('Action required'), 'SC5: Action required message rendered');

    // SC6
    const m6 = await svc.renderBetaOrderStatusMessage({ betaOrderId: 'bord_1', messageType: 'BETA_EMERGENCY_STOP_NOTICE', actor: actorCust });
    assert(m6.body.includes('Emergency stop active'), 'SC6: Emergency stop notice rendered safely');

    // SC7
    const m7 = await svc.renderBetaOrderStatusMessage({ betaOrderId: 'bord_1', messageType: 'BETA_ROLLBACK_NOTICE', actor: actorCust });
    assert(m7.body.includes('rolled back'), 'SC7: Rollback notice rendered safely');

    // SC8
    const ticket = await svc.createBetaSupportTicket({ customerId: 'c_1', betaOrderId: 'bord_1', payload: { message: 'Help' }, actor: actorCust });
    assert(ticket.id.startsWith('tick_'), 'SC8: Support ticket created');

    // SC9
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/betaCommunicationsService.js'), 'utf-8');
    assert(!content.includes('order.status ='), 'SC9: Support ticket does not mutate gates');

    // SC10
    try {
        await svc.createBetaSupportTicket({ customerId: 'c_1', betaOrderId: 'bord_1', payload: { message: 'Is this guaranteed delivery?' }, actor: actorCust });
        assert(false, 'SC10: Forbidden wording blocked');
    } catch(e) {
        assert(e.message.includes('forbidden claim'), 'SC10: Forbidden wording blocked');
    }

    // SC11
    assert(svc._mockEvents.length >= 8, 'SC11: Messages audited');

    // SC12
    assert(!content.includes('nodemailer') && !content.includes('sendgrid'), 'SC12: No external provider required');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 86D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
