'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 123A: Founding Printhouse Pilot Schema Smoke ===\n');

// 1. Migration 067 exists
const migrationPath = path.join(__dirname, '..', 'migrations', '067_phase123_founding_printhouse_pilot_gate.sql');
const migrationExists = fs.existsSync(migrationPath);
assert(migrationExists, 'Migration 067 file exists');

if (migrationExists) {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Tables
  const tables = [
    'founding_printhouse_pilot_programs',
    'founding_printhouse_pilot_participants',
    'founding_printhouse_pilot_order_links',
    'founding_printhouse_pilot_reviews',
    'founding_printhouse_pilot_findings',
    'founding_printhouse_pilot_audits',
    'founding_printhouse_pilot_evidence_packs',
  ];
  for (const t of tables) {
    assert(sql.includes(`CREATE TABLE IF NOT EXISTS ${t}`), `Table ${t} defined`);
  }

  // Safety columns
  const safetyColumns = [
    'full_public_enabled', 'open_marketplace_enabled', 'payment_execution_enabled',
    'refund_execution_enabled', 'payout_execution_enabled', 'external_tax_submission_enabled',
    'external_accounting_submission_enabled', 'provider_external_submission_enabled',
    'source_mutation_outside_pilot_scope', 'production_activation_enabled',
    'production_handoff_allowed', 'review_only', 'pilot_only', 'founding_printhouse_only',
  ];
  for (const col of safetyColumns) {
    assert(sql.includes(col), `Safety column ${col} exists`);
  }

  // All safety columns default to safe values
  assert(sql.includes('full_public_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'full_public_enabled defaults to 0');
  assert(sql.includes('open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'open_marketplace_enabled defaults to 0');
  assert(sql.includes('payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'payment_execution_enabled defaults to 0');
  assert(sql.includes('refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'refund_execution_enabled defaults to 0');
  assert(sql.includes('payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'payout_execution_enabled defaults to 0');
  assert(sql.includes('production_handoff_allowed TINYINT(1) NOT NULL DEFAULT 0'), 'production_handoff_allowed defaults to 0');
  assert(sql.includes('review_only TINYINT(1) NOT NULL DEFAULT 1'), 'review_only defaults to 1');

  // Indexes
  const indexes = [
    'idx_fppg_programs_tenant_id', 'idx_fppg_programs_status', 'idx_fppg_programs_created_at',
    'idx_fppg_participants_program_id', 'idx_fppg_participants_printhouse_tenant', 'idx_fppg_participants_status',
    'idx_fppg_order_links_program_id', 'idx_fppg_order_links_participant_id', 'idx_fppg_order_links_status',
    'idx_fppg_reviews_program_id', 'idx_fppg_reviews_participant_id', 'idx_fppg_reviews_status',
    'idx_fppg_findings_program_id', 'idx_fppg_findings_status', 'idx_fppg_findings_blocks_handoff', 'idx_fppg_findings_severity',
    'idx_fppg_audits_program_id', 'idx_fppg_audits_event_type', 'idx_fppg_audits_created_at',
    'idx_fppg_evidence_program_id', 'idx_fppg_evidence_status', 'idx_fppg_evidence_generated_at',
  ];
  for (const idx of indexes) {
    assert(sql.includes(idx), `Index ${idx} exists`);
  }

  // Foreign keys
  assert(sql.includes('fk_fppg_participants_program'), 'FK participants -> programs');
  assert(sql.includes('fk_fppg_order_links_program'), 'FK order_links -> programs');
  assert(sql.includes('fk_fppg_order_links_participant'), 'FK order_links -> participants');
  assert(sql.includes('fk_fppg_reviews_program'), 'FK reviews -> programs');
  assert(sql.includes('fk_fppg_findings_program'), 'FK findings -> programs');
  assert(sql.includes('fk_fppg_audits_program'), 'FK audits -> programs');
  assert(sql.includes('fk_fppg_evidence_program'), 'FK evidence -> programs');
  assert(sql.includes('ON DELETE RESTRICT'), 'ON DELETE RESTRICT used');

  // Participant columns
  assert(sql.includes('participant_status'), 'participant_status column');
  assert(sql.includes('printhouse_tenant_id'), 'printhouse_tenant_id column');
  assert(sql.includes('printhouse_name'), 'printhouse_name column');
  assert(sql.includes('allowed_file_access_level'), 'allowed_file_access_level column');
  assert(sql.includes('payment_execution_allowed'), 'payment_execution_allowed column');
  assert(sql.includes('provider_submission_allowed'), 'provider_submission_allowed column');

  // Evidence pack columns
  assert(sql.includes('evidence_hash'), 'evidence_hash column');
  assert(sql.includes('evidence_schema_version'), 'evidence_schema_version column');
  assert(sql.includes('redaction_classification'), 'redaction_classification column');

  // No forbidden patterns
  const forbidden = [
    'fullPublicEnabled: true', 'openMarketplaceAccessEnabled: true',
    'paymentExecutionEnabled: true', 'charge(', 'capture(', 'refund(', 'payout(',
    'sendToProvider', 'submitTax', 'submitVat', 'submitAccounting',
  ];
  for (const f of forbidden) {
    assert(!sql.includes(f), `No forbidden pattern: ${f}`);
  }
}

console.log(`\n=== Phase 123A Results: PASS ${passed} | FAIL ${failed} ===`);
if (failed > 0) process.exit(1);
