'use strict';

const { spawnSync } = require('child_process');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 131 Operational Review Acceptance Pack ===\n');

const smokes = [
  'smoke_phase131a_operational_review_schema.js',
  'smoke_phase131b_operational_review_service.js',
  'smoke_phase131c_operational_review_readiness.js',
  'smoke_phase131d_exit_criteria_scoring.js',
  'smoke_phase131e_expansion_decision_gate.js',
  'smoke_phase131f_operational_review_admin_api_ui.js',
  'smoke_phase131g_operational_review_evidence_pack.js',
  'smoke_phase130h_runtime_observation_acceptance_pack.js'
];

for (const script of smokes) {
  console.log(`Running ${script}...`);
  const res = spawnSync('node', [`scripts/${script}`], { stdio: 'inherit' });
  if (res.status === 0) {
    assert(true, `${script} passed`);
  } else {
    assert(false, `${script} failed with exit code ${res.status}`);
  }
}

// Check for forbidden execution
const fs = require('fs');
const path = require('path');
const svcPath = path.join(__dirname, '../src/api/services/controlledBetaOperationalReviewService.js');
const svcCode = fs.readFileSync(svcPath, 'utf8');

assert(!svcCode.includes('fullPublicEnabled: true'), 'safety invariants remain disabled');
assert(!svcCode.includes('publicSignupEnabled: true'), 'public signup remains disabled');
assert(!svcCode.includes('enableFullPublic'), 'no forbidden execution calls exist');
assert(!svcCode.includes('enableOpenMarketplace'), 'no forbidden execution calls exist');
assert(!svcCode.includes('sendInvite('), 'no automatic invites');
assert(!svcCode.includes('addParticipant('), 'no automatic participants');

console.log(`\nSmoke 131H: Finished execution. ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFATAL: Phase 131 Acceptance Pack Failed.');
  process.exit(1);
} else {
  console.log('\nSUCCESS: Phase 131 Acceptance Pack Passed.');
  process.exit(0);
}
