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
    console.log('\n━━━ Phase 100A — Production Activation Review Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/040_phase100_controlled_production_activation_review.sql');
    
    // SC1
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    // SC2
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_production_activation_reviews'), 'SC2: Activation review table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_production_activation_review_checks'), 'SC2: Checks table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_production_activation_review_findings'), 'SC2: Findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_production_activation_review_approvals'), 'SC2: Approvals table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_production_activation_review_audit_events'), 'SC2: Audit events table defined');

    // SC3
    assert(content.includes('go_no_go_status'), 'SC3: go_no_go_status column exists');
    assert(content.includes('security_status'), 'SC3: security_status column exists');
    assert(content.includes('operational_status'), 'SC3: operational_status column exists');

    // SC4 & SC5 & SC6 & SC7
    assert(!content.includes('execute_payment') && !content.includes('execute_refund') && !content.includes('execute_payout'), 'SC4: No live execution tables exist');
    assert(!content.includes('external_submission'), 'SC5: No external submission table exists');
    assert(!content.includes('full_public'), 'SC6: No FULL_PUBLIC enablement table exists');
    assert(!content.includes('live_provider'), 'SC7: No live provider connectivity table exists');
    assert(content.includes('activation_review_id') && content.includes('evidence_json'), 'SC8: Schema is review/readiness/audit/evidence oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 100A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
