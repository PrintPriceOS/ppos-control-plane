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
    console.log('\n━━━ Phase 101A — Provider Connectivity Sandbox Readiness Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/041_phase101_provider_connectivity_sandbox_readiness.sql');
    
    // SC1
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    // SC2
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_sandboxes'), 'SC2: Sandbox table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_sandbox_connection_tests'), 'SC2: Connection tests table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_sandbox_findings'), 'SC2: Findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_sandbox_audit_events'), 'SC2: Audit events table defined');

    // SC3
    assert(content.includes('live_provider_connectivity_enabled BOOLEAN DEFAULT FALSE'), 'SC3: live_provider_connectivity_enabled defaults FALSE');
    assert(content.includes('sandbox_only BOOLEAN DEFAULT TRUE'), 'SC3: sandbox_only defaults TRUE');
    assert(content.includes('mock_provider_enabled BOOLEAN DEFAULT TRUE'), 'SC3: mock_provider_enabled defaults TRUE');
    assert(content.includes('stubbed_provider_enabled BOOLEAN DEFAULT TRUE'), 'SC3: stubbed_provider_enabled defaults TRUE');
    assert(content.includes('full_public_enabled BOOLEAN DEFAULT FALSE'), 'SC3: full_public_enabled defaults FALSE');

    // SC4 & SC5
    assert(!content.includes('execute_payment') && !content.includes('execute_refund') && !content.includes('execute_payout'), 'SC4: No live execution tables exist');
    assert(!content.includes('external_submission'), 'SC5: No external submission table exists');
    assert(content.includes('evidence_json'), 'SC6: Schema is evidence oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 101A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
