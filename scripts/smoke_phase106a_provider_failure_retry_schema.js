'use strict';

const fs = require('fs');
const path = require('path');

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
    console.log('\n━━━ Phase 106A — Provider Failure / Retry Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/046_phase106_provider_failure_retry_readiness.sql');
    
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_failure_retry_runs'), 'SC2: Retry runs table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_failure_retry_attempts'), 'SC2: Retry attempts table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_circuit_breaker_reviews'), 'SC2: Circuit breaker reviews table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_failure_retry_findings'), 'SC2: Findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_failure_retry_audit_events'), 'SC2: Audit events table defined');

    assert(content.includes('circuit_breaker_state'), 'SC3: circuit_breaker_state column exists');
    assert(content.includes('backoff_strategy'), 'SC3: backoff_strategy column exists');
    assert(content.includes('retry_delay_ms'), 'SC3: retry_delay_ms column exists');
    
    assert(!content.includes('CREATE TABLE IF NOT EXISTS live_retry_execution'), 'SC4: No live retry execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS live_provider_connectivity'), 'SC5: No live provider connectivity table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS execute_payment') && !content.includes('CREATE TABLE IF NOT EXISTS execute_refund'), 'SC6: No live payment/refund/payout execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS external_submission'), 'SC7: No external submission table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS full_public_enablement'), 'SC8: No FULL_PUBLIC enablement table exists');
    assert(content.includes('evidence_json'), 'SC9: Schema is failure-retry-readiness/audit/evidence oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 106A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
