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
    console.log('\n━━━ Phase 102A — Provider Contract / SLA Readiness Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/042_phase102_provider_contract_sla_readiness.sql');
    
    // SC1
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    // SC2
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_contracts'), 'SC2: Provider contracts table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_slas'), 'SC2: Provider slas table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_contract_sla_checks'), 'SC2: Checks table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_contract_sla_findings'), 'SC2: Findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_contract_sla_audit_events'), 'SC2: Audit events table defined');

    // SC3
    assert(content.includes('legal_review_status VARCHAR(50) NOT NULL DEFAULT \'PENDING\''), 'SC3: legal_review_status defaults PENDING');
    assert(content.includes('finance_review_status VARCHAR(50) NOT NULL DEFAULT \'PENDING\''), 'SC3: finance_review_status defaults PENDING');
    assert(content.includes('security_review_status VARCHAR(50) NOT NULL DEFAULT \'PENDING\''), 'SC3: security_review_status defaults PENDING');
    assert(content.includes('operations_review_status VARCHAR(50) NOT NULL DEFAULT \'PENDING\''), 'SC3: operations_review_status defaults PENDING');
    assert(content.includes('data_processing_review_status VARCHAR(50) NOT NULL DEFAULT \'PENDING\''), 'SC3: data_processing_review_status defaults PENDING');

    // SC4 & SC5
    assert(!content.includes('execute_payment') && !content.includes('execute_refund') && !content.includes('execute_payout'), 'SC4: No live execution tables exist');
    assert(!content.includes('external_submission'), 'SC5: No external submission table exists');
    assert(content.includes('evidence_json'), 'SC6: Schema is evidence oriented');
    assert(!content.includes('live_provider_connectivity'), 'SC7: No live provider connectivity table exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 102A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
