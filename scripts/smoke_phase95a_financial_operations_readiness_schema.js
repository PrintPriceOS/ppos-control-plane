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
    console.log('\n━━━ Phase 95A — FinOps Readiness Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/035_phase95_financial_operations_readiness.sql');
    
    // SC1
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    // SC2
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_readiness_runs'), 'SC2: Runs table defined');
    
    // SC3 (columns)
    assert(content.includes('readiness_status'), 'SC3: Critical columns exist (readiness_status)');
    assert(content.includes('reconciliation_status') && content.includes('tax_vat_status') && content.includes('invoice_status'), 'SC4: Phase aggregation columns exist');
    
    // SC4
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_readiness_findings'), 'SC5: Findings table exists');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_readiness_checklist'), 'SC6: Checklist table exists');

    // SC5
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_readiness_audit_events'), 'SC7: Audit table exists');

    // SC6
    assert(!content.includes('external_submission') && !content.includes('payout_execution') && !content.includes('payment_execution'), 'SC8: No execution tables exist');

    // SC7
    assert(content.includes('readiness') && content.includes('audit_events') && content.includes('checklist'), 'SC9: Schema is consolidation/readiness/audit-oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 95A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
