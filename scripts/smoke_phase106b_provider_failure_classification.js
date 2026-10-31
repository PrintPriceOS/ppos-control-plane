'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderFailureClassificationService = require('../src/api/services/financialOperationsProviderFailureClassificationService');

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
    console.log('\n━━━ Phase 106B — Provider Failure Classification Smoke ━━━\n');

    const svc = new FinancialOperationsProviderFailureClassificationService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const commonPayload = {
        failureRetryRunId: 'run_1',
        providerKey: 'stripe_mock',
        providerType: 'PAYMENT_PROVIDER',
        failureMode: 'MOCK_FAILURE'
    };

    // SC1: Classify mock timeout failure
    const err1 = { code: 'timeout', message: 'Connection timed out', livemode: false, metadata: { secret_token: 'abc' } };
    const c1 = await svc.classifyFailure(commonPayload, err1, actorAdmin);
    assert(c1.failure_category === 'NETWORK_TIMEOUT', 'SC1: Classify mock timeout failure');

    // SC2: Classify stubbed provider 5XX failure
    const err2 = { status: 503, message: 'Service Unavailable', livemode: false };
    const c2 = await svc.classifyFailure({ ...commonPayload, failureMode: 'STUBBED_FAILURE' }, err2, actorAdmin);
    assert(c2.failure_category === 'PROVIDER_5XX', 'SC2: Classify stubbed provider 5XX failure');

    // SC3: Classify dry-run rate limit failure
    const err3 = { status: 429, message: 'Too Many Requests', livemode: false };
    const c3 = await svc.classifyFailure({ ...commonPayload, failureMode: 'DRY_RUN_FAILURE' }, err3, actorAdmin);
    assert(c3.failure_category === 'RATE_LIMITED', 'SC3: Classify dry-run rate limit failure');

    // SC4: Classify idempotency conflict
    const err4 = { code: 'idempotency_conflict', message: 'Keys do not match', livemode: false };
    const c4 = await svc.classifyFailure(commonPayload, err4, actorAdmin);
    assert(c4.failure_category === 'IDEMPOTENCY_CONFLICT', 'SC4: Classify idempotency conflict');

    // SC5: Reject live provider failure marker
    try {
        await svc.classifyFailure(commonPayload, { livemode: true }, actorAdmin);
        assert(false, 'SC5: Reject live provider failure marker');
    } catch (e) {
        assert(e.message.includes('Live failure marker detected'), 'SC5: Reject live provider failure marker');
    }

    // SC6: Reject plaintext secret/API key in failure payload
    try {
        await svc.classifyFailure(commonPayload, { livemode: false, error_detail: 'bearer a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q' }, actorAdmin);
        assert(false, 'SC6: Reject plaintext secret/API key in failure payload');
    } catch (e) {
        assert(e.message.includes('Plaintext secret detected'), 'SC6: Reject plaintext secret/API key in failure payload');
    }

    // SC7: Redacted payload does not expose secrets
    assert(c1.redacted_payload_json.metadata.secret_token === '[REDACTED]', 'SC7: Redacted payload does not expose secrets');

    // SC8: Source object remains unchanged
    assert(err1.metadata.secret_token === 'abc', 'SC8: Source object remains unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 106B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
