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
  console.log('\n━━━ Phase 116A — Production Deployment Readiness Schema ━━━\n');

  const MIG = 'migrations/058_phase116_production_deployment_readiness_checklist.sql';

  console.log('[1] Migration file');
  assert(exists(MIG), 'A1: Migration 058 exists');
  assert(has(MIG, 'production_deployment_readiness_checks'), 'A2: Table production_deployment_readiness_checks');
  assert(has(MIG, 'production_deployment_readiness_results'), 'A3: Table production_deployment_readiness_results');
  assert(has(MIG, 'production_deployment_readiness_findings'), 'A4: Table production_deployment_readiness_findings');
  assert(has(MIG, 'production_deployment_readiness_audits'), 'A5: Table production_deployment_readiness_audits');

  console.log('\n[2] Safety columns');
  assert(has(MIG, 'checklist_only BOOLEAN NOT NULL DEFAULT TRUE'), 'A6: checklist_only default true');
  assert(has(MIG, 'deployment_executed BOOLEAN NOT NULL DEFAULT FALSE'), 'A7: deployment_executed default false');
  assert(has(MIG, 'production_activation_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'A8: production_activation_enabled default false');
  assert(has(MIG, 'full_public_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'A9: full_public_enabled default false');
  assert(has(MIG, 'live_provider_connectivity_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'A10: live_provider_connectivity_enabled default false');
  assert(has(MIG, 'payment_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'A11: payment_execution_enabled default false');
  assert(has(MIG, 'refund_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'A12: refund_execution_enabled default false');
  assert(has(MIG, 'payout_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'A13: payout_execution_enabled default false');
  assert(has(MIG, 'external_submission_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'A14: external_submission_enabled default false');
  assert(has(MIG, 'source_mutation_enabled BOOLEAN NOT NULL DEFAULT FALSE'), 'A15: source_mutation_enabled default false');

  console.log('\n[3] Check categories');
  assert(has(MIG, "'ENVIRONMENT'", "'MIGRATIONS'", "'BACKUP'", "'SECRETS'",
    "'OBSERVABILITY'", "'ROLLBACK'", "'SUPPORT'"), 'A16: All required check categories defined');

  console.log('\n[4] Finding severity levels');
  assert(has(MIG, "'BLOCKER'", "'MAJOR'", "'MINOR'", "'INFO'"), 'A17: Finding severity levels');

  console.log('\n[5] No forbidden patterns');
  assert(!has(MIG, 'charge(', 'capture(', 'refund(', 'payout(', 'submitTax', 'submitVat', 'sendToProvider'),
    'A18: No forbidden execution patterns in migration');

  console.log(`\n━━━ Phase 116A RESULT: ${PASS} PASS / ${FAIL} FAIL ━━━\n`);
  if (FAIL > 0) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
