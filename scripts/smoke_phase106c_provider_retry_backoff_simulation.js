'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderRetrySimulationService = require('../src/api/services/financialOperationsProviderRetrySimulationService');

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
    console.log('\n━━━ Phase 106C — Provider Retry Backoff Simulation Smoke ━━━\n');

    const svc = new FinancialOperationsProviderRetrySimulationService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const commonFailure = {
        failure_retry_run_id: 'run_1',
        retry_attempt_id: 'att_1',
        failure_category: 'NETWORK_TIMEOUT',
        request_payload_json: { idempotency_key: 'ik_1' }
    };

    const validPolicy = {
        strategy: 'EXPONENTIAL_BACKOFF',
        base_delay_ms: 1000,
        max_attempts: 3,
        dead_letter_path: 'sqs://dlq'
    };

    // SC1: Exponential backoff schedule is deterministic
    const sim1 = await svc.simulateRetrySchedule(commonFailure, validPolicy, 2, actorAdmin);
    assert(sim1.scheduled && sim1.delayMs === 2000, 'SC1: Exponential backoff schedule is deterministic');

    // SC2: Jittered exponential backoff is deterministic with fixed seed (simulated by attemptNumber)
    const jitterPolicy = { ...validPolicy, strategy: 'JITTERED_EXPONENTIAL_BACKOFF' };
    const sim2 = await svc.simulateRetrySchedule(commonFailure, jitterPolicy, 3, actorAdmin);
    assert(sim2.scheduled && sim2.delayMs === 4030, 'SC2: Jittered exponential backoff is deterministic with fixed seed'); // (1000 * 2^2) + 3*10 = 4000 + 30 = 4030

    // SC3: No retry for non-retryable 4XX
    const err4xx = { ...commonFailure, failure_category: 'PROVIDER_4XX' };
    const sim3 = await svc.simulateRetrySchedule(err4xx, validPolicy, 1, actorAdmin);
    assert(sim3.reason === 'NO_RETRY', 'SC3: No retry for non-retryable 4XX');

    // SC4: Retry for sandbox timeout
    const sim4 = await svc.simulateRetrySchedule(commonFailure, validPolicy, 1, actorAdmin);
    assert(sim4.scheduled, 'SC4: Retry for sandbox timeout');

    // SC5: Missing idempotency key creates finding
    const noIkFailure = { ...commonFailure, request_payload_json: {} };
    const sim5 = await svc.simulateRetrySchedule(noIkFailure, validPolicy, 1, actorAdmin);
    assert(sim5.reason === 'BLOCK', 'SC5: Missing idempotency key creates finding');
    assert(svc._mockFindings.some(f => f.recommended_action === 'retry without idempotency key'), 'SC5: Finding created for missing ik');

    // SC6: Infinite retry policy is blocked
    const infinitePolicy = { ...validPolicy, max_attempts: 15 };
    const sim6 = await svc.simulateRetrySchedule(commonFailure, infinitePolicy, 1, actorAdmin);
    assert(sim6.reason === 'BLOCK', 'SC6: Infinite retry policy is blocked');
    assert(svc._mockFindings.some(f => f.recommended_action === 'unsafe infinite retry'), 'SC6: Finding created for infinite retry');

    // SC7: Dead-letter missing creates finding
    const noDlqPolicy = { ...validPolicy, dead_letter_path: null };
    const sim7 = await svc.simulateRetrySchedule(commonFailure, noDlqPolicy, 1, actorAdmin);
    assert(sim7.reason === 'BLOCK', 'SC7: Dead-letter missing creates finding');
    assert(svc._mockFindings.some(f => f.recommended_action === 'missing dead-letter path'), 'SC7: Finding created for missing dead letter');

    // SC8: Source records remain unchanged
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderRetrySimulationService.js'), 'utf-8');
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('axios'), 'SC8: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 106C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
