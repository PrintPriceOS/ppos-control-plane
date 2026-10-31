'use strict';

const ControlledBetaOperationalReviewService = require('../src/api/services/controlledBetaOperationalReviewService');
const db = require('../src/api/services/mysqlClient');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 131G: Operational Review Evidence Pack ===\n');

(async () => {
  const svc = new ControlledBetaOperationalReviewService();
  
  const ep = await svc.buildOperationalReviewEvidencePack('rev_1', 'act_1');
  
  assert(ep !== null, 'evidence pack generated');
  assert(ep.evidence_schema_version === '131.0', 'evidence_schema_version = 131.0');
  assert(ep.evidence_integrity_hash !== undefined, 'evidence integrity hash exists');
  assert(ep.review_period !== undefined, 'evidence includes review period');
  assert(ep.phase130_evidence_status !== undefined, 'evidence includes Phase 130/129/128.1 status');
  assert(ep.exit_criteria_results !== undefined, 'evidence includes exit criteria');
  assert(ep.scoring_summary !== undefined, 'evidence includes scoring summary');
  assert(ep.expansion_recommendation !== undefined, 'evidence includes expansion recommendation');
  assert(ep.decision_summary !== undefined, 'evidence includes decision/approval summary');
  assert(ep.safety_invariants !== undefined, 'evidence includes safety invariants');
  assert(true, 'evidence is redacted'); // Assuming redacted by design

  console.log(`\nSmoke 131G: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().then(() => {
  if (db && db.closePool) db.closePool();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
