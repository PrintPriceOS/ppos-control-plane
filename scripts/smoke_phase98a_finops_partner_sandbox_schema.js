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
    console.log('\n━━━ Phase 98A — FinOps Partner Sandbox Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/038_phase98_financial_operations_partner_sandbox.sql');
    
    // SC1
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    // SC2
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_partner_sandboxes'), 'SC2: Partner sandboxes table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_partner_sandbox_sessions'), 'SC2: Partner sandbox sessions table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_partner_sandbox_runs'), 'SC2: Partner sandbox runs table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_partner_sandbox_findings'), 'SC2: Partner sandbox findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_partner_sandbox_audit_events'), 'SC2: Partner sandbox audit events table defined');

    // SC3
    assert(content.includes('sandbox_only BOOLEAN DEFAULT TRUE'), 'SC3: sandbox_only defaults to true');
    assert(content.includes('mock_provider_enabled BOOLEAN DEFAULT TRUE'), 'SC3: mock_provider_enabled defaults to true');
    assert(content.includes('external_execution_enabled BOOLEAN DEFAULT FALSE'), 'SC3: external_execution_enabled defaults to false');
    assert(content.includes('full_public_enabled BOOLEAN DEFAULT FALSE'), 'SC4: full_public_enabled defaults to false');

    // SC5
    assert(!content.includes('execute_payment') && !content.includes('execute_refund') && !content.includes('execute_payout'), 'SC5: No live execution tables exist');
    assert(!content.includes('external_submission'), 'SC6: No external submission table exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 98A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
