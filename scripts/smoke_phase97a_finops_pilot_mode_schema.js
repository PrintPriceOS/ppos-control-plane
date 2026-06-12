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
    console.log('\n━━━ Phase 97A — FinOps Pilot Mode Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/037_phase97_financial_operations_pilot_mode.sql');
    
    // SC1
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    // SC2
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_pilot_programs'), 'SC2: Pilot programs table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_pilot_runs'), 'SC2: Pilot runs table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_pilot_approvals'), 'SC2: Pilot approvals table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_pilot_findings'), 'SC2: Pilot findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_pilot_audit_events'), 'SC2: Pilot audit events table defined');

    // SC3
    assert(content.includes('external_execution_enabled BOOLEAN DEFAULT FALSE'), 'SC3: external_execution_enabled defaults to false');
    assert(content.includes('full_public_enabled BOOLEAN DEFAULT FALSE'), 'SC4: full_public_enabled defaults to false');
    assert(content.includes('dry_run_only BOOLEAN DEFAULT TRUE'), 'SC5: dry_run_only defaults to true');

    // SC6
    assert(!content.includes('execute_payment') && !content.includes('execute_refund') && !content.includes('execute_payout'), 'SC6: No live execution tables exist');
    assert(!content.includes('external_submission'), 'SC7: No external submission table exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 97A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
