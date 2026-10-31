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
    console.log('\n━━━ Phase 108A — Financial Data Retention / Privacy Readiness Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/048_phase108_financial_data_retention_privacy_readiness.sql');
    
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_data_retention_policies'), 'SC2: Policies table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_data_retention_reviews'), 'SC2: Retention reviews table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_privacy_request_reviews'), 'SC2: Privacy request reviews table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_data_privacy_findings'), 'SC2: Findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_data_privacy_audit_events'), 'SC2: Audit events table defined');

    assert(content.includes('redaction_required BOOLEAN DEFAULT TRUE'), 'SC3: redaction_required defaults true');
    assert(content.includes('manual_review_required BOOLEAN DEFAULT TRUE'), 'SC3: manual_review_required defaults true');
    assert(content.includes('production_execution_enabled BOOLEAN DEFAULT FALSE'), 'SC3: production_execution_enabled defaults false');
    assert(content.includes('full_public_enabled BOOLEAN DEFAULT FALSE'), 'SC3: full_public_enabled defaults false');

    assert(!content.includes('CREATE TABLE IF NOT EXISTS live_deletion_execution'), 'SC4: No live deletion execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS live_anonymization_execution'), 'SC5: No live anonymization execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS source_record_mutation'), 'SC6: No source mutation table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS live_provider_connectivity'), 'SC7: No live provider connectivity table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS execute_payment') && !content.includes('CREATE TABLE IF NOT EXISTS execute_refund'), 'SC8: No live payment/refund/payout execution table exists');
    assert(content.includes('evidence_json') && content.includes('source_snapshot_json'), 'SC9: Schema is retention/privacy-readiness/audit/evidence oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 108A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
