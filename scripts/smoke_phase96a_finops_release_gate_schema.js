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
    console.log('\n━━━ Phase 96A — FinOps Release Gate Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/036_phase96_financial_operations_release_gates.sql');
    
    // SC1
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    // SC2
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_release_gates'), 'SC2: Gates table defined');
    
    // SC3
    assert(content.includes('gate_status'), 'SC3: Critical columns exist (gate_status)');
    
    // SC4
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_release_gate_checks'), 'SC4: Checks table exists');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_release_gate_approvals'), 'SC4: Approvals table exists');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_release_gate_audit_events'), 'SC4: Audit table exists');

    // SC5
    assert(!content.includes('execute_payment') && !content.includes('execute_refund') && !content.includes('execute_payout'), 'SC5: No payment/refund/payout execution tables exist');
    assert(!content.includes('external_submission'), 'SC6: No external submission table exists');
    assert(!content.includes('full_public_enablement'), 'SC7: No FULL_PUBLIC enablement table exists');

    // SC6
    assert(content.includes('release_gate') && content.includes('audit_events') && content.includes('evidence_json'), 'SC8: Schema is release-gate/audit/evidence oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 96A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
