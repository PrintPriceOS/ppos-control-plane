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
    console.log('\n━━━ Phase 110A — Go-Live Simulation Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/050_phase110_financial_operations_go_live_simulation.sql');
    
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_go_live_simulations'), 'SC2: Simulations table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_go_live_simulation_steps'), 'SC2: Steps table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_go_live_simulation_checklists'), 'SC2: Checklists table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_go_live_simulation_findings'), 'SC2: Findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_go_live_simulation_audit_events'), 'SC2: Audit events table defined');

    assert(!content.includes('CREATE TABLE IF NOT EXISTS production_activation_execution'), 'SC3: No production activation execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS full_public_enablement'), 'SC4: No FULL_PUBLIC enablement table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS live_provider_connectivity'), 'SC5: No live provider connectivity table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS payment_execution'), 'SC6: No payment/refund/payout execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS external_submission'), 'SC7: No external submission table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS source_record_mutation'), 'SC8: No source mutation table exists');

    assert(content.includes('evidence_json') && content.includes('source_snapshot_json') && content.includes('simulated_activation_status'), 'SC9: Schema is go-live-simulation/readiness/audit/evidence oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 110A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
