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
  'smoke_phase131_0_1_acceptance_failure_diagnostics.js',
  'smoke_phase130h_runtime_observation_acceptance_pack.js'
];

const failedSmokes = [];

for (const script of smokes) {
  console.log(`Running ${script}...`);
  const res = spawnSync('node', [`scripts/${script}`], { encoding: 'utf-8' });
  
  // Print output so it's still visible
  if (res.stdout) console.log(res.stdout);
  if (res.stderr) console.error(res.stderr);

  if (res.status === 0) {
    assert(true, `${script} passed`);
  } else {
    assert(false, `${script} failed with exit code ${res.status}`);
    
    let reason = `exit code ${res.status}`;
    const failLines = (res.stdout + res.stderr).split('\n').filter(l => l.includes('FAIL:'));
    if (failLines.length > 0) {
        reason = failLines.map(l => l.trim().replace('FAIL:', '').trim()).join(' | ');
    } else {
        const errLines = (res.stderr || '').split('\n').filter(l => l.trim().length > 0);
        if (errLines.length > 0) reason = errLines[0];
    }
    
    failedSmokes.push({ script, reason });
  }
}

// Check for forbidden execution
const fs = require('fs');
const path = require('path');
const svcPath = path.join(__dirname, '../src/api/services/controlledBetaOperationalReviewService.js');
let svcCode = fs.readFileSync(svcPath, 'utf8');

// Strip single and multi line comments to avoid false positives
svcCode = svcCode.replace(/\/\/.*/g, '');
svcCode = svcCode.replace(/\/\*[\s\S]*?\*\//g, '');

const forbidden = [
  'fullPublicEnabled: true',
  'openMarketplaceEnabled: true',
  'publicSignupEnabled: true',
  'publicBetaEnabled: true',
  'paymentExecutionEnabled: true',
  'providerExternalSubmissionEnabled: true',
  'sourceMutationEnabled: true',
  'autoExpansionEnabled: true',
  'enableFullPublic',
  'enableOpenMarketplace',
  'enablePublicBeta',
  'sendInvite(',
  'createInvite(',
  'addParticipant('
];

for (const pattern of forbidden) {
  assert(!svcCode.includes(pattern), `Forbidden pattern scanner verifies ${pattern} is absent in executable paths`);
}

console.log(`\nSmoke 131H: Finished execution. ${passed} passed, ${failed} failed`);
if (failed > 0 || failedSmokes.length > 0) {
  if (failedSmokes.length > 0) {
    console.error('\nFAILED_SUBSMOKES:');
    for (const f of failedSmokes) {
      console.error(`* ${f.script}: ${f.reason}`);
    }
  }
  console.error('\nFATAL: Phase 131 Acceptance Pack Failed.');
  process.exit(1);
} else {
  console.log('\nSUCCESS: Phase 131 Acceptance Pack Passed.');
  process.exit(0);
}
