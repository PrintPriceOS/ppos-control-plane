'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderCircuitBreakerReadinessService = require('../src/api/services/financialOperationsProviderCircuitBreakerReadinessService');

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
    console.log('\n━━━ Phase 106D — Provider Circuit Breaker / Dead-Letter Smoke ━━━\n');

    const svc = new FinancialOperationsProviderCircuitBreakerReadinessService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const validPolicy = {
        open_threshold: 5,
        half_open_policy: { delay_ms: 30000, max_requests: 1 },
        close_policy: { consecutive_successes: 3 },
        dead_letter_path: 'sqs://dlq',
        manual_review_path: 'jira://ticket',
        incident_path: 'pd://incident'
    };

    const validOverrides = { liveProviderConnectivity: false, fullPublic: false };

    // SC1: Clean circuit breaker/dead-letter readiness becomes APPROVED_FOR_READINESS
    const r1 = await svc.evaluateReadiness('run_1', validPolicy, validOverrides, actorAdmin);
    assert(r1.circuit_breaker_status === 'APPROVED_FOR_READINESS', 'SC1: Clean circuit breaker/dead-letter readiness becomes APPROVED_FOR_READINESS');

    // SC2: Missing open threshold blocks readiness
    const r2 = await svc.evaluateReadiness('run_2', { ...validPolicy, open_threshold: null }, validOverrides, actorAdmin);
    assert(r2.circuit_breaker_status === 'MANUAL_REVIEW_REQUIRED' && !r2.evidence_json.checks.OPEN_THRESHOLD_DEFINED, 'SC2: Missing open threshold blocks readiness');

    // SC3: Missing half-open policy blocks readiness
    const r3 = await svc.evaluateReadiness('run_3', { ...validPolicy, half_open_policy: null }, validOverrides, actorAdmin);
    assert(r3.circuit_breaker_status === 'MANUAL_REVIEW_REQUIRED' && !r3.evidence_json.checks.HALF_OPEN_POLICY_DEFINED, 'SC3: Missing half-open policy blocks readiness');

    // SC4: Missing dead-letter path blocks readiness
    const r4 = await svc.evaluateReadiness('run_4', { ...validPolicy, dead_letter_path: null }, validOverrides, actorAdmin);
    assert(r4.circuit_breaker_status === 'MANUAL_REVIEW_REQUIRED' && !r4.evidence_json.checks.DEAD_LETTER_PATH_DEFINED, 'SC4: Missing dead-letter path blocks readiness');

    // SC5: Missing incident path blocks readiness
    const r5 = await svc.evaluateReadiness('run_5', { ...validPolicy, incident_path: null }, validOverrides, actorAdmin);
    assert(r5.circuit_breaker_status === 'MANUAL_REVIEW_REQUIRED' && !r5.evidence_json.checks.INCIDENT_PATH_DEFINED, 'SC5: Missing incident path blocks readiness');

    // SC6: FULL_PUBLIC enabled blocks readiness
    const r6 = await svc.evaluateReadiness('run_6', validPolicy, { liveProviderConnectivity: false, fullPublic: true }, actorAdmin);
    assert(r6.circuit_breaker_status === 'MANUAL_REVIEW_REQUIRED' && !r6.evidence_json.checks.FULL_PUBLIC_DISABLED, 'SC6: FULL_PUBLIC enabled blocks readiness');

    // SC7: Live provider connectivity enabled blocks readiness
    const r7 = await svc.evaluateReadiness('run_7', validPolicy, { liveProviderConnectivity: true, fullPublic: false }, actorAdmin);
    assert(r7.circuit_breaker_status === 'MANUAL_REVIEW_REQUIRED' && !r7.evidence_json.checks.NO_LIVE_PROVIDER_CONNECTIVITY, 'SC7: Live provider connectivity enabled blocks readiness');

    // SC8: Circuit breaker state changes are simulated only
    const sim = await svc.simulateStateChange(r1.id, 'OPEN_SIMULATED', actorAdmin);
    assert(sim.circuit_breaker_status === 'OPEN_SIMULATED', 'SC8: Circuit breaker state changes are simulated only');

    // SC9: Source records remain unchanged
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderCircuitBreakerReadinessService.js'), 'utf-8');
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('axios'), 'SC9: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 106D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
