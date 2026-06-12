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
    console.log('\n━━━ Phase 112A — Final Release Candidate Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/052_phase112_financial_operations_final_release_candidate.sql');
    
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_final_release_candidates'), 'SC2: Candidates table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_final_release_candidate_checks'), 'SC2: Checks table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_final_release_candidate_evidence'), 'SC2: Evidence table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_final_release_candidate_findings'), 'SC2: Findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_final_release_candidate_audit_events'), 'SC2: Audit events table defined');

    assert(content.includes('production_activation_enabled BOOLEAN DEFAULT FALSE'), 'SC3: production_activation_enabled defaults false');
    assert(content.includes('full_public_enabled BOOLEAN DEFAULT FALSE'), 'SC3: full_public_enabled defaults false');
    assert(content.includes('live_provider_connectivity_enabled BOOLEAN DEFAULT FALSE'), 'SC3: live_provider_connectivity_enabled defaults false');

    assert(!content.includes('CREATE TABLE IF NOT EXISTS production_activation_execution'), 'SC4: No production activation execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS full_public_enablement'), 'SC5: No FULL_PUBLIC enablement table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS live_provider_connectivity'), 'SC6: No live provider connectivity table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS payment_execution'), 'SC7: No payment/refund/payout execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS external_submission'), 'SC8: No external submission table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS source_record_mutation'), 'SC9: No source mutation table exists');

    assert(content.includes('evidence_json') && content.includes('source_snapshot_json') && content.includes('release_candidate_mode'), 'SC10: Schema is final-release-candidate/readiness/audit/evidence oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 112A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
