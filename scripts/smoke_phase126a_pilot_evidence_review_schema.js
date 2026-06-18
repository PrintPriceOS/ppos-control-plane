'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 126A: Pilot Evidence Review Schema Smoke ===\n');

const migrationPath = path.join(__dirname, '..', 'migrations', '070_phase126_pilot_evidence_review_go_no_go.sql');
const migrationExists = fs.existsSync(migrationPath);
assert(migrationExists, 'Migration 070 file exists');

if (migrationExists) {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const tables = [
    'pilot_evidence_review_boards',
    'pilot_evidence_review_checks',
    'pilot_evidence_review_findings',
    'pilot_evidence_go_no_go_decisions',
    'pilot_evidence_review_audits',
    'pilot_evidence_review_packs',
  ];
  for (const t of tables) {
    assert(sql.includes(`CREATE TABLE IF NOT EXISTS ${t}`), `Table ${t} defined`);
  }

  const safetyColumns = [
    'pilot_only', 'review_only', 'decision_only', 'beta_enabled',
    'production_activation_enabled', 'full_public_enabled', 'open_marketplace_enabled',
    'payment_execution_enabled', 'refund_execution_enabled', 'payout_execution_enabled',
    'provider_external_submission_enabled', 'external_tax_submission_enabled',
    'external_accounting_submission_enabled', 'source_mutation_enabled',
  ];
  for (const col of safetyColumns) {
    assert(sql.includes(col), `Safety column ${col} exists`);
  }

  assert(sql.includes('pilot_only TINYINT(1) NOT NULL DEFAULT 1'), 'pilot_only defaults to 1');
  assert(sql.includes('review_only TINYINT(1) NOT NULL DEFAULT 1'), 'review_only defaults to 1');
  assert(sql.includes('decision_only TINYINT(1) NOT NULL DEFAULT 1'), 'decision_only defaults to 1');
  assert(sql.includes('beta_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'beta_enabled defaults to 0');
  assert(sql.includes('production_activation_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'production_activation_enabled defaults to 0');
  assert(sql.includes('full_public_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'full_public_enabled defaults to 0');
  assert(sql.includes('open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'open_marketplace_enabled defaults to 0');
  assert(sql.includes('payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'payment_execution_enabled defaults to 0');
  assert(sql.includes('refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'refund_execution_enabled defaults to 0');
  assert(sql.includes('payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'payout_execution_enabled defaults to 0');
  assert(sql.includes('source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'source_mutation_enabled defaults to 0');

  assert(sql.includes('evidence_hash'), 'evidence_hash column exists');
  assert(sql.includes('evidence_schema_version'), 'evidence_schema_version column exists');
  assert(sql.includes('redaction_classification'), 'redaction_classification column exists');

  assert(sql.includes('blocks_go_decision'), 'blocks_go_decision column exists');
  assert(sql.includes('decision_outcome'), 'decision_outcome column exists');
  assert(sql.includes('readiness_snapshot_json'), 'readiness_snapshot_json column exists');
  assert(sql.includes('unresolved_blockers_count'), 'unresolved_blockers_count column exists');

  const indexes = [
    'idx_perb_status', 'idx_perb_phase', 'idx_perb_created_at',
    'idx_perc_board_id', 'idx_perc_check_key', 'idx_perc_check_status', 'idx_perc_phase_ref', 'idx_perc_created_at',
    'idx_perf_board_id', 'idx_perf_finding_status', 'idx_perf_blocks_go', 'idx_perf_severity', 'idx_perf_created_at',
    'idx_pegng_board_id', 'idx_pegng_decision_status', 'idx_pegng_outcome', 'idx_pegng_created_at',
    'idx_pera_board_id', 'idx_pera_decision_id', 'idx_pera_event_type', 'idx_pera_created_at',
    'idx_perp_board_id', 'idx_perp_decision_id', 'idx_perp_evidence_status', 'idx_perp_generated_at',
  ];
  for (const idx of indexes) {
    assert(sql.includes(idx), `Index ${idx} exists`);
  }
}

console.log(`\nPhase 126A Schema: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
