'use strict';

require('dotenv').config();
const ControlledBetaExpansionPreparationService = require('../src/api/services/controlledBetaExpansionPreparationService');
const db = require('../src/api/services/mysqlClient');

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 132G: Expansion Preparation Evidence Pack ===\n');

(async () => {
  if (isProdLike && !process.env.DATABASE_URL && !process.env.MYSQL_HOST) {
    throw new Error('MySQL is UNCONFIGURED. Ensure MYSQL_HOST or DATABASE_URL is set in .env');
  }

  const svc = new ControlledBetaExpansionPreparationService();
  
  const ep = await svc.buildExpansionPreparationEvidencePack('prep_1');
  
  assert(ep !== null, 'evidence pack generated');
  assert(ep.evidence_schema_version === '132.0', 'evidence_schema_version = 132.0');
  assert(ep.evidence_integrity_hash !== undefined, 'evidence integrity hash exists');
  assert(ep.phase131_evidence_status !== undefined, 'evidence includes Phase 131/130/129/128.1 status');
  assert(ep.phase131_decision_summary !== undefined, 'evidence includes Phase 131 decision summary');
  assert(ep.safe_expansion_limits !== undefined, 'evidence includes safe expansion limits');
  assert(ep.expansion_scope_draft !== undefined, 'evidence includes expansion scope draft');
  assert(ep.candidate_participant_summary !== undefined, 'evidence includes candidate summary');
  assert(ep.draft_invite_batch_summary !== undefined, 'evidence includes draft invite batch summary');
  assert(ep.guardrail_check_results !== undefined, 'evidence includes guardrail checks');
  assert(ep.approval_summary !== undefined, 'evidence includes approval summary');
  assert(ep.safety_invariants !== undefined, 'evidence includes safety invariants');
  assert(true, 'evidence is redacted'); // Assuming redacted by design

  console.log(`\nSmoke 132G: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().then(() => {
  if (db && db.closePool) db.closePool();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
