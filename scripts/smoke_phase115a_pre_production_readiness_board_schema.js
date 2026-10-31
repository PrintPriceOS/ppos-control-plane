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

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function src(relPath) {
  try { return fs.readFileSync(path.join(ROOT, relPath), 'utf-8'); }
  catch (_) { return ''; }
}

function has(relPath, ...patterns) {
  const content = src(relPath);
  return patterns.every(p => content.includes(p));
}

async function run() {
  console.log('\n━━━ Phase 115A — Pre-Production Readiness Board Schema ━━━\n');

  const MIGRATION = 'migrations/057_phase115_pre_production_operational_readiness_board.sql';

  console.log('[1] Migration file exists');
  assert(exists(MIGRATION), 'S1: Migration 057 exists');

  console.log('\n[2] Tables defined');
  assert(has(MIGRATION, 'pre_production_readiness_boards'), 'S2: Table pre_production_readiness_boards');
  assert(has(MIGRATION, 'pre_production_readiness_board_reviews'), 'S3: Table pre_production_readiness_board_reviews');
  assert(has(MIGRATION, 'pre_production_readiness_board_findings'), 'S4: Table pre_production_readiness_board_findings');
  assert(has(MIGRATION, 'pre_production_readiness_board_audits'), 'S5: Table pre_production_readiness_board_audits');

  console.log('\n[3] Safety columns defined');
  assert(has(MIGRATION, 'review_only BOOLEAN NOT NULL DEFAULT TRUE'), 'S6: review_only DEFAULT TRUE');
  assert(has(MIGRATION, 'production_activation_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'S7: production_activation_enabled DEFAULT FALSE');
  assert(has(MIGRATION, 'full_public_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'S8: full_public_enabled DEFAULT FALSE');
  assert(has(MIGRATION, 'live_provider_connectivity_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'S9: live_provider_connectivity_enabled DEFAULT FALSE');
  assert(has(MIGRATION, 'payment_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'S10: payment_execution_enabled DEFAULT FALSE');
  assert(has(MIGRATION, 'refund_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'S11: refund_execution_enabled DEFAULT FALSE');
  assert(has(MIGRATION, 'payout_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'S12: payout_execution_enabled DEFAULT FALSE');
  assert(has(MIGRATION, 'external_submission_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'S13: external_submission_enabled DEFAULT FALSE');
  assert(has(MIGRATION, 'source_mutation_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'S14: source_mutation_enabled DEFAULT FALSE');

  console.log('\n[4] Departments enum defined');
  assert(has(MIGRATION, 'OPERATIONS'), 'S15: OPERATIONS department');
  assert(has(MIGRATION, 'FINANCE'), 'S16: FINANCE department');
  assert(has(MIGRATION, 'TECHNICAL'), 'S17: TECHNICAL department');
  assert(has(MIGRATION, 'COMPLIANCE'), 'S18: COMPLIANCE department');
  assert(has(MIGRATION, 'SECURITY'), 'S19: SECURITY department');
  assert(has(MIGRATION, 'CUSTOMER_SUPPORT'), 'S20: CUSTOMER_SUPPORT department');
  assert(has(MIGRATION, 'PRINT_PARTNER_SUCCESS'), 'S21: PRINT_PARTNER_SUCCESS department');

  console.log('\n[5] Board status enum defined');
  assert(has(MIGRATION, "'DRAFT'"), 'S22: DRAFT status');
  assert(has(MIGRATION, "'IN_REVIEW'"), 'S23: IN_REVIEW status');
  assert(has(MIGRATION, "'CHANGES_REQUIRED'"), 'S24: CHANGES_REQUIRED status');
  assert(has(MIGRATION, "'READY_FOR_SIGN_OFF'"), 'S25: READY_FOR_SIGN_OFF status');
  assert(has(MIGRATION, "'SIGNED_OFF_FOR_CONTROLLED_PRODUCTION_REVIEW'"), 'S26: SIGNED_OFF status');
  assert(has(MIGRATION, "'REJECTED'"), 'S27: REJECTED status');

  console.log('\n[6] Findings table has blocks_sign_off column');
  assert(has(MIGRATION, 'blocks_sign_off BOOLEAN NOT NULL DEFAULT TRUE'), 'S28: blocks_sign_off DEFAULT TRUE');

  console.log(`\n── Results: ${PASS} PASS / ${FAIL} FAIL ──\n`);
  if (FAIL > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
