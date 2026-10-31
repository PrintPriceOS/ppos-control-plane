'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderEventNormalizationService = require('../src/api/services/financialOperationsProviderEventNormalizationService');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}`);
    }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 105B — Provider Event Normalization Smoke ━━━\n');

    const svc = new FinancialOperationsProviderEventNormalizationService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const commonPayload = {
        eventReconciliationRunId: 'run_1',
        providerKey: 'stripe_mock',
        providerType: 'PAYMENT_PROVIDER',
        eventMode: 'MOCK_PROVIDER_EVENT',
        eventType: 'PAYMENT_CAPTURED_EVENT'
    };

    // SC1: Normalize mock provider payment captured event
    const sourceEvent1 = { id: 'evt_1', type: 'charge.succeeded', amount: 1000, currency: 'usd', status: 'succeeded', livemode: false, metadata: { secret_token: 'abc' } };
    const n1 = await svc.normalizeProviderEvent(commonPayload, sourceEvent1, 'sandbox_sig', actorAdmin);
    assert(n1.event_status === 'NORMALIZED' && n1.normalized_event_json.amount === 1000, 'SC1: Normalize mock provider payment captured event');

    // SC2: Normalize stubbed refund event
    const sourceEvent2 = { id: 'evt_2', type: 'refund.created', amount: 500, currency: 'usd', status: 'succeeded', livemode: false };
    const n2 = await svc.normalizeProviderEvent({ ...commonPayload, eventMode: 'STUBBED_PROVIDER_EVENT', eventType: 'REFUND_CREATED_EVENT' }, sourceEvent2, 'fake_sig', actorAdmin);
    assert(n2.event_status === 'NORMALIZED', 'SC2: Normalize stubbed refund event');

    // SC3: Normalize dry-run payout event
    const sourceEvent3 = { id: 'evt_3', type: 'payout.created', amount: 1500, currency: 'usd', status: 'pending', livemode: false };
    const n3 = await svc.normalizeProviderEvent({ ...commonPayload, eventMode: 'DRY_RUN_EVENT', eventType: 'PAYOUT_CREATED_EVENT' }, sourceEvent3, 'test_sig', actorAdmin);
    assert(n3.event_status === 'NORMALIZED', 'SC3: Normalize dry-run payout event');

    // SC4: Reject live event marker
    try {
        await svc.normalizeProviderEvent(commonPayload, { livemode: true }, 'sandbox_sig', actorAdmin);
        assert(false, 'SC4: Reject live event marker');
    } catch (e) {
        assert(e.message.includes('Live event marker detected'), 'SC4: Reject live event marker');
    }

    // SC5: Reject live signature marker
    try {
        await svc.normalizeProviderEvent(commonPayload, { livemode: false }, 'real_live_signature_123', actorAdmin);
        assert(false, 'SC5: Reject live signature marker');
    } catch (e) {
        assert(e.message.includes('Live signature marker detected'), 'SC5: Reject live signature marker');
    }

    // SC6: Reject plaintext secret/API key in payload
    try {
        await svc.normalizeProviderEvent(commonPayload, { livemode: false, key: 'sk_live_12345' }, 'sandbox_sig', actorAdmin);
        assert(false, 'SC6: Reject plaintext secret/API key in payload');
    } catch (e) {
        assert(e.message.includes('Plaintext secret detected in payload'), 'SC6: Reject plaintext secret/API key in payload');
    }

    // SC7: Redacted payload does not expose secrets
    assert(n1.redacted_payload_json.metadata.secret_token === '[REDACTED]', 'SC7: Redacted payload does not expose secrets');

    // SC8: Source event object remains unchanged
    assert(sourceEvent1.metadata.secret_token === 'abc', 'SC8: Source event object remains unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 105B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
