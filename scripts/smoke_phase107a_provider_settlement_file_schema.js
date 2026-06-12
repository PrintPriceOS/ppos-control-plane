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
    console.log('\n━━━ Phase 107A — Provider Settlement File Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/047_phase107_provider_settlement_file_readiness.sql');
    
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_settlement_file_runs'), 'SC2: Settlement file runs table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_settlement_file_rows'), 'SC2: Settlement file rows table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_settlement_matches'), 'SC2: Settlement matches table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_settlement_findings'), 'SC2: Findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_settlement_audit_events'), 'SC2: Audit events table defined');

    assert(content.includes('file_mode'), 'SC3: file_mode column exists');
    assert(content.includes('file_format'), 'SC3: file_format column exists');
    assert(content.includes('transaction_reference'), 'SC3: transaction_reference column exists');
    
    assert(!content.includes('CREATE TABLE IF NOT EXISTS live_settlement_processing'), 'SC4: No live settlement processing table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS live_provider_connectivity'), 'SC5: No live provider connectivity table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS execute_payment') && !content.includes('CREATE TABLE IF NOT EXISTS execute_refund'), 'SC6: No live payment/refund/payout execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS external_submission'), 'SC7: No external submission table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS full_public_enablement'), 'SC8: No FULL_PUBLIC enablement table exists');
    assert(content.includes('evidence_json'), 'SC9: Schema is settlement-file-readiness/audit/evidence oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 107A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
