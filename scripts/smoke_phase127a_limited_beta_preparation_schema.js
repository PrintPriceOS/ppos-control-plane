'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 127A: Limited Beta Preparation Gate Schema Smoke ===\n');

const migrationPath = path.join(__dirname, '..', 'migrations', '072_phase127_limited_beta_preparation_gate.sql');
const migrationExists = fs.existsSync(migrationPath);
assert(migrationExists, 'Migration 072 file exists');

if (migrationExists) {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const tables = [
    'limited_beta_preparation_gates',
    'limited_beta_cohorts',
    'limited_beta_cohort_participants',
    'limited_beta_invite_codes',
    'limited_beta_terms_acceptances',
    'limited_beta_role_boundaries',
    'limited_beta_support_escalations',
    'limited_beta_incident_rollback_plans',
    'limited_beta_findings',
    'limited_beta_audits',
    'limited_beta_evidence_packs',
  ];
  for (const t of tables) {
    assert(sql.includes(`CREATE TABLE IF NOT EXISTS ${t}`), `Table ${t} defined`);
  }

  const safetyColumns = [
    'beta_runtime_enabled',
    'full_public_enabled',
    'open_marketplace_enabled',
    'payment_execution_enabled',
    'refund_execution_enabled',
    'payout_execution_enabled',
    'live_provider_connectivity_enabled',
    'provider_external_submission_enabled',
    'external_tax_submission_enabled',
    'external_accounting_submission_enabled',
    'source_mutation_enabled',
    'invite_only',
    'review_only',
  ];
  for (const col of safetyColumns) {
    assert(sql.includes(col), `Safety column ${col} exists`);
  }

  assert(sql.includes('beta_runtime_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'beta_runtime_enabled defaults to 0');
  assert(sql.includes('full_public_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'full_public_enabled defaults to 0');
  assert(sql.includes('open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'open_marketplace_enabled defaults to 0');
  assert(sql.includes('payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'payment_execution_enabled defaults to 0');
  assert(sql.includes('refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'refund_execution_enabled defaults to 0');
  assert(sql.includes('payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'payout_execution_enabled defaults to 0');
  assert(sql.includes('live_provider_connectivity_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'live_provider_connectivity_enabled defaults to 0');
  assert(sql.includes('provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'provider_external_submission_enabled defaults to 0');
  assert(sql.includes('external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'external_tax_submission_enabled defaults to 0');
  assert(sql.includes('external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'external_accounting_submission_enabled defaults to 0');
  assert(sql.includes('source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'source_mutation_enabled defaults to 0');
  assert(sql.includes('invite_only TINYINT(1) NOT NULL DEFAULT 1'), 'invite_only defaults to 1');
  assert(sql.includes('review_only TINYINT(1) NOT NULL DEFAULT 1'), 'review_only defaults to 1');
}

console.log(`\nPhase 127A Schema: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
