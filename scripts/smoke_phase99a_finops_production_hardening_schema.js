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
    console.log('\n━━━ Phase 99A — FinOps Production Hardening Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/039_phase99_financial_operations_production_hardening.sql');
    
    // SC1
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    // SC2
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_hardening_runs'), 'SC2: Hardening runs table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_hardening_checks'), 'SC2: Hardening checks table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_hardening_findings'), 'SC2: Hardening findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_hardening_audit_events'), 'SC2: Hardening audit events table defined');

    // SC3
    assert(content.includes('security_status'), 'SC3: security_status column exists');
    assert(content.includes('configuration_status'), 'SC3: configuration_status column exists');
    assert(content.includes('observability_status'), 'SC3: observability_status column exists');
    assert(content.includes('rollback_status'), 'SC3: rollback_status column exists');

    // SC4 & SC5 & SC6 & SC7
    assert(!content.includes('execute_payment') && !content.includes('execute_refund') && !content.includes('execute_payout'), 'SC4: No live execution tables exist');
    assert(!content.includes('external_submission'), 'SC5: No external submission table exists');
    assert(!content.includes('full_public'), 'SC6: No FULL_PUBLIC enablement table exists');
    assert(content.includes('hardening_run_id') && content.includes('evidence_json'), 'SC7: Schema is hardening/readiness/audit/evidence oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 99A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
