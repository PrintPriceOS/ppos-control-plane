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
    console.log('\n━━━ Phase 94A — Invoice/Credit Note Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/034_phase94_invoice_credit_note_lifecycle.sql');
    
    // SC1
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    // SC2
    assert(content.includes('CREATE TABLE IF NOT EXISTS governed_invoices'), 'SC2: governed_invoices table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS governed_credit_notes'), 'SC3: governed_credit_notes table defined');
    
    // SC3 (columns)
    assert(content.includes('lifecycle_status'), 'SC4: Critical columns exist (lifecycle_status)');
    assert(content.includes('source_snapshot_json'), 'SC5: Critical columns exist (source_snapshot_json)');
    
    // SC4
    assert(content.includes('CREATE TABLE IF NOT EXISTS governed_invoice_versions'), 'SC6: Version tables exist (invoice)');
    assert(content.includes('CREATE TABLE IF NOT EXISTS governed_credit_note_versions'), 'SC7: Version tables exist (credit note)');

    // SC5
    assert(content.includes('CREATE TABLE IF NOT EXISTS invoice_lifecycle_audit_events'), 'SC8: Audit table exists');
    assert(content.includes('CREATE TABLE IF NOT EXISTS invoice_credit_note_links'), 'SC9: Links table exists');

    // SC6
    assert(!content.includes('external_submission') && !content.includes('payout_execution'), 'SC10: No external submission or payout table exists');

    // SC7
    assert(content.includes('governed_invoice_versions') && content.includes('audit_events'), 'SC11: Schema is lifecycle/audit/version oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 94A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
