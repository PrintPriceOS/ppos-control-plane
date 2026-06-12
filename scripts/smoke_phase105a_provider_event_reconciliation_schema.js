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
    console.log('\n━━━ Phase 105A — Provider Event Reconciliation Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/045_phase105_provider_event_reconciliation_readiness.sql');
    
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_event_reconciliation_runs'), 'SC2: Reconciliation runs table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_event_records'), 'SC2: Event records table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_event_matches'), 'SC2: Event matches table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_event_reconciliation_findings'), 'SC2: Findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_event_reconciliation_audit_events'), 'SC2: Audit events table defined');

    assert(content.includes('source_event_count INT DEFAULT 0'), 'SC3: source_event_count defaults 0');
    assert(content.includes('matched_event_count INT DEFAULT 0'), 'SC3: matched_event_count defaults 0');
    assert(content.includes('mismatched_event_count INT DEFAULT 0'), 'SC3: mismatched_event_count defaults 0');
    
    assert(!content.includes('CREATE TABLE IF NOT EXISTS live_webhook_ingestion'), 'SC4: No live webhook ingestion table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS live_provider_connectivity'), 'SC5: No live provider connectivity table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS execute_payment') && !content.includes('CREATE TABLE IF NOT EXISTS execute_refund'), 'SC6: No live payment/refund/payout execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS external_submission'), 'SC7: No external submission table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS full_public_enablement'), 'SC8: No FULL_PUBLIC enablement table exists');
    assert(content.includes('evidence_json'), 'SC9: Schema is event-reconciliation-readiness/audit/evidence oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 105A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
