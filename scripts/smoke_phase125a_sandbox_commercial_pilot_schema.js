'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 125A: Sandbox Commercial Pilot Schema Smoke ===\n');

const migrationPath = path.join(__dirname, '..', 'migrations', '069_phase125_sandbox_commercial_invoice_payment_handoff_pilot.sql');
const migrationExists = fs.existsSync(migrationPath);
assert(migrationExists, 'Migration 069 file exists');

if (migrationExists) {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const tables = [
    'sandbox_commercial_pilot_runs',
    'sandbox_commercial_invoice_previews',
    'sandbox_commercial_payment_simulations',
    'sandbox_commercial_settlement_previews',
    'sandbox_commercial_printhouse_confirmations',
    'sandbox_commercial_findings',
    'sandbox_commercial_audits',
    'sandbox_commercial_evidence_packs',
  ];
  for (const t of tables) {
    assert(sql.includes(`CREATE TABLE IF NOT EXISTS ${t}`), `Table ${t} defined`);
  }

  const safetyColumns = [
    'sandbox_only', 'pilot_only', 'review_only',
    'payment_execution_enabled', 'refund_execution_enabled', 'payout_execution_enabled',
    'external_tax_submission_enabled', 'external_accounting_submission_enabled',
    'provider_live_capture_enabled', 'provider_external_submission_enabled',
    'source_mutation_enabled', 'full_public_enabled', 'open_marketplace_enabled',
    'production_activation_enabled',
  ];
  for (const col of safetyColumns) {
    assert(sql.includes(col), `Safety column ${col} exists`);
  }

  assert(sql.includes('sandbox_only TINYINT(1) NOT NULL DEFAULT 1'), 'sandbox_only defaults to 1');
  assert(sql.includes('payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'payment_execution_enabled defaults to 0');
  assert(sql.includes('refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'refund_execution_enabled defaults to 0');
  assert(sql.includes('payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'payout_execution_enabled defaults to 0');
  assert(sql.includes('provider_live_capture_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'provider_live_capture_enabled defaults to 0');
  assert(sql.includes('full_public_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'full_public_enabled defaults to 0');
  assert(sql.includes('open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'open_marketplace_enabled defaults to 0');
  assert(sql.includes('source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'source_mutation_enabled defaults to 0');
  assert(sql.includes('review_only TINYINT(1) NOT NULL DEFAULT 1'), 'review_only defaults to 1');

  assert(sql.includes('invoice_preview_only TINYINT(1) NOT NULL DEFAULT 1'), 'invoice_preview_only defaults to 1');
  assert(sql.includes('invoice_issued TINYINT(1) NOT NULL DEFAULT 0'), 'invoice_issued defaults to 0');
  assert(sql.includes('source_mutation TINYINT(1) NOT NULL DEFAULT 0'), 'source_mutation defaults to 0');
  assert(sql.includes('payment_simulation_only TINYINT(1) NOT NULL DEFAULT 1'), 'payment_simulation_only defaults to 1');
  assert(sql.includes('payout_preview_only TINYINT(1) NOT NULL DEFAULT 1'), 'payout_preview_only defaults to 1');

  assert(sql.includes('evidence_hash'), 'evidence_hash column exists');
  assert(sql.includes('evidence_schema_version'), 'evidence_schema_version column exists');
  assert(sql.includes('redaction_classification'), 'redaction_classification column exists');

  const indexes = [
    'idx_scpilot_runs_program_id', 'idx_scpilot_runs_status', 'idx_scpilot_runs_created_at',
    'idx_scpilot_invoices_run_id', 'idx_scpilot_invoices_status',
    'idx_scpilot_payments_run_id', 'idx_scpilot_payments_type', 'idx_scpilot_payments_status',
    'idx_scpilot_settlements_run_id', 'idx_scpilot_settlements_status',
    'idx_scpilot_confirmations_run_id', 'idx_scpilot_confirmations_status',
    'idx_scpilot_findings_run_id', 'idx_scpilot_findings_status', 'idx_scpilot_findings_blocks',
    'idx_scpilot_audits_run_id', 'idx_scpilot_audits_event_type', 'idx_scpilot_audits_created_at',
    'idx_scpilot_evidence_run_id', 'idx_scpilot_evidence_status', 'idx_scpilot_evidence_generated_at',
  ];
  for (const idx of indexes) {
    assert(sql.includes(idx), `Index ${idx} exists`);
  }

  assert(sql.includes('fk_scpilot_invoices_run'), 'FK invoices -> runs');
  assert(sql.includes('fk_scpilot_payments_run'), 'FK payments -> runs');
  assert(sql.includes('fk_scpilot_settlements_run'), 'FK settlements -> runs');
  assert(sql.includes('fk_scpilot_confirmations_run'), 'FK confirmations -> runs');
  assert(sql.includes('fk_scpilot_findings_run'), 'FK findings -> runs');
  assert(sql.includes('fk_scpilot_audits_run'), 'FK audits -> runs');
  assert(sql.includes('fk_scpilot_evidence_run'), 'FK evidence -> runs');
  assert(sql.includes('ON DELETE RESTRICT'), 'ON DELETE RESTRICT used');

  const forbidden = [
    'fullPublicEnabled: true', 'openMarketplaceAccessEnabled: true',
    'paymentExecutionEnabled: true', 'refundExecutionEnabled: true',
    'payoutExecutionEnabled: true', 'providerLiveCaptureEnabled: true',
    'externalTaxSubmissionEnabled: true', 'externalAccountingSubmissionEnabled: true',
    'invoiceIssued: true', 'sourceMutation: true',
    'charge(', 'capture(', 'refund(', 'payout(',
    'sendToProvider', 'submitTax', 'submitVat', 'submitAccounting',
  ];
  for (const f of forbidden) {
    assert(!sql.includes(f), `No forbidden pattern: ${f}`);
  }
}

console.log(`\n=== Phase 125A Results: PASS ${passed} | FAIL ${failed} ===`);
if (failed > 0) process.exit(1);
