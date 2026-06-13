'use strict';

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
    if (condition) { PASS++; console.log(`  ✅  [PASS] ${label}`); }
    else { FAIL++; console.error(`  ❌  [FAIL] ${label}`); }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 113A — Production Activation Gate Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/053_phase113_financial_operations_production_activation_gate.sql');
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const sql = fs.readFileSync(migPath, 'utf-8');

    assert(sql.includes('CREATE TABLE IF NOT EXISTS financial_operations_production_activation_gates'), 'SC2: Gates table defined');
    assert(sql.includes('CREATE TABLE IF NOT EXISTS financial_operations_production_activation_gate_checks'), 'SC2: Checks table defined');
    assert(sql.includes('CREATE TABLE IF NOT EXISTS financial_operations_production_activation_gate_approvals'), 'SC2: Approvals table defined');
    assert(sql.includes('CREATE TABLE IF NOT EXISTS financial_operations_production_activation_gate_findings'), 'SC2: Findings table defined');
    assert(sql.includes('CREATE TABLE IF NOT EXISTS financial_operations_production_activation_gate_audit_events'), 'SC2: Audit events table defined');

    assert(sql.includes('production_activation_enabled BOOLEAN DEFAULT FALSE'), 'SC3: production_activation_enabled defaults false');
    assert(sql.includes('activation_execution_enabled BOOLEAN DEFAULT FALSE'), 'SC3: activation_execution_enabled defaults false');
    assert(sql.includes('full_public_enabled BOOLEAN DEFAULT FALSE'), 'SC3: full_public_enabled defaults false');
    assert(sql.includes('live_provider_connectivity_enabled BOOLEAN DEFAULT FALSE'), 'SC3: live_provider_connectivity_enabled defaults false');
    assert(sql.includes('live_credentials_enabled BOOLEAN DEFAULT FALSE'), 'SC3: live_credentials_enabled defaults false');
    assert(sql.includes('payment_execution_enabled BOOLEAN DEFAULT FALSE'), 'SC3: payment_execution_enabled defaults false');
    assert(sql.includes('refund_execution_enabled BOOLEAN DEFAULT FALSE'), 'SC3: refund_execution_enabled defaults false');
    assert(sql.includes('payout_execution_enabled BOOLEAN DEFAULT FALSE'), 'SC3: payout_execution_enabled defaults false');
    assert(sql.includes('external_invoice_submission_enabled BOOLEAN DEFAULT FALSE'), 'SC3: external_invoice_submission_enabled defaults false');
    assert(sql.includes('tax_filing_enabled BOOLEAN DEFAULT FALSE'), 'SC3: tax_filing_enabled defaults false');
    assert(sql.includes('vat_return_submission_enabled BOOLEAN DEFAULT FALSE'), 'SC3: vat_return_submission_enabled defaults false');
    assert(sql.includes('external_report_submission_enabled BOOLEAN DEFAULT FALSE'), 'SC3: external_report_submission_enabled defaults false');
    assert(sql.includes('live_personal_data_export_enabled BOOLEAN DEFAULT FALSE'), 'SC3: live_personal_data_export_enabled defaults false');
    assert(sql.includes('source_record_mutation_enabled BOOLEAN DEFAULT FALSE'), 'SC3: source_record_mutation_enabled defaults false');

    assert(!sql.includes('CREATE TABLE IF NOT EXISTS production_activation_execution'), 'SC4: No production activation execution table');
    assert(!sql.includes('CREATE TABLE IF NOT EXISTS full_public_enablement_execution'), 'SC5: No FULL_PUBLIC enablement execution table');
    assert(!sql.includes('CREATE TABLE IF NOT EXISTS live_provider_connectivity_execution'), 'SC6: No live provider connectivity execution table');
    assert(!sql.includes('CREATE TABLE IF NOT EXISTS payment_execution_table'), 'SC7: No payment/refund/payout execution table');
    assert(!sql.includes('CREATE TABLE IF NOT EXISTS external_submission_execution'), 'SC8: No external submission execution table');
    assert(!sql.includes('CREATE TABLE IF NOT EXISTS source_mutation'), 'SC9: No source mutation table');

    assert(sql.includes('activation_eligibility_status') && sql.includes('evidence_json') && sql.includes('source_snapshot_json'), 'SC10: Schema is activation-gate/readiness/audit/evidence oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 113A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);
    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => { console.error('Smoke crashed:', err); process.exit(1); });
