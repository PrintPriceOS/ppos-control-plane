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
    console.log('\n━━━ Phase 93A — Tax/VAT Jurisdiction Readiness Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/033_phase93_tax_vat_readiness_schema.sql');
    
    // SC1
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    // SC2
    assert(content.includes('CREATE TABLE IF NOT EXISTS tax_vat_jurisdictions'), 'SC2: tax_vat_jurisdictions table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS tax_vat_rules'), 'SC3: tax_vat_rules table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS tax_vat_readiness_snapshots'), 'SC4: tax_vat_readiness_snapshots table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS tax_vat_readiness_findings'), 'SC5: tax_vat_readiness_findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS tax_vat_readiness_audit_events'), 'SC6: tax_vat_readiness_audit_events table defined');

    // SC3 (columns)
    assert(content.includes('jurisdiction_code'), 'SC7: Critical columns exist (jurisdiction_code)');
    assert(content.includes('tax_amount_estimated'), 'SC8: Critical columns exist (tax_amount_estimated)');
    assert(content.includes('readiness_status'), 'SC9: Critical columns exist (readiness_status)');
    assert(content.includes('evidence_json'), 'SC10: Critical columns exist (evidence_json)');
    
    // SC4
    assert(!content.includes('tax_filing') && !content.includes('external_submission'), 'SC11: No external tax filing/submission table exists');

    // SC5
    assert(content.includes('tax_vat_readiness_snapshots') && content.includes('audit_events'), 'SC12: Schema is snapshot/audit-oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 93A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
