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
    console.log('\n━━━ Phase 109A — Financial Compliance Reporting Readiness Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/049_phase109_financial_compliance_reporting_readiness.sql');
    
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_compliance_report_definitions'), 'SC2: Report definitions table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_compliance_report_runs'), 'SC2: Report runs table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_compliance_report_sections'), 'SC2: Report sections table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_compliance_report_findings'), 'SC2: Findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_compliance_report_audit_events'), 'SC2: Audit events table defined');

    assert(content.includes('redaction_required BOOLEAN DEFAULT TRUE'), 'SC3: redaction_required defaults true');
    assert(content.includes('manual_review_required BOOLEAN DEFAULT TRUE'), 'SC3: manual_review_required defaults true');
    assert(content.includes('external_submission_enabled BOOLEAN DEFAULT FALSE'), 'SC3: external_submission_enabled defaults false');
    assert(content.includes('tax_filing_enabled BOOLEAN DEFAULT FALSE'), 'SC3: tax_filing_enabled defaults false');
    assert(content.includes('production_execution_enabled BOOLEAN DEFAULT FALSE'), 'SC3: production_execution_enabled defaults false');
    assert(content.includes('full_public_enabled BOOLEAN DEFAULT FALSE'), 'SC3: full_public_enabled defaults false');

    assert(!content.includes('CREATE TABLE IF NOT EXISTS regulatory_submission_execution'), 'SC4: No regulatory submission execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS tax_filing_execution'), 'SC5: No tax filing execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS live_external_provider'), 'SC6: No live external provider table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS source_record_mutation'), 'SC7: No source mutation table exists');

    assert(content.includes('evidence_json') && content.includes('source_snapshot_json') && content.includes('redacted_preview_json'), 'SC8: Schema is compliance-reporting-readiness/audit/evidence oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 109A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
