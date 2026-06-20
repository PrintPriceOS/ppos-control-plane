'use strict';

require('dotenv').config();
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 130H: Phase 130 Acceptance Pack Aggregator ===\n');

const smokes = [
  'smoke_phase130a_runtime_observation_schema.js',
  'smoke_phase130b_runtime_observation_service.js',
  'smoke_phase130c_runtime_observation_readiness.js',
  'smoke_phase130d_runtime_observation_events_health.js',
  'smoke_phase130e_runtime_observation_incident_killswitch_risk.js',
  'smoke_phase130f_runtime_observation_admin_api_ui.js',
  'smoke_phase130g_runtime_observation_evidence_pack.js',
  'smoke_phase129h_controlled_beta_activation_acceptance_pack.js'
];

function runScript(scriptName) {
  return new Promise((resolve) => {
    console.log(`\n--- Running ${scriptName} ---`);
    const child = fork(path.join(__dirname, scriptName), [], {
      env: {
        ...process.env,
        NODE_ENV: 'test'
      },
      silent: false
    });

    child.on('exit', (code) => {
      if (code === 0) {
        assert(true, `${scriptName} executed successfully`);
      } else {
        assert(false, `${scriptName} failed with code ${code}`);
      }
      resolve();
    });
  });
}

(async () => {
  for (const script of smokes) {
    if (!fs.existsSync(path.join(__dirname, script))) {
      assert(false, `Script missing: ${script}`);
      continue;
    }
    await runScript(script);
  }

  // Double check forbidden patterns across the codebase
  console.log('\n--- Verifying Forbidden Patterns ---');
  const serviceCode = fs.readFileSync(path.join(__dirname, '../src/api/services/controlledBetaRuntimeObservationService.js'), 'utf8');
  assert(!serviceCode.includes('fullPublicEnabled: true'), 'Forbidden: fullPublicEnabled: true is absent');
  assert(!serviceCode.includes('openMarketplaceEnabled: true'), 'Forbidden: openMarketplaceEnabled: true is absent');
  assert(!serviceCode.includes('paymentExecutionEnabled: true'), 'Forbidden: paymentExecutionEnabled: true is absent');

  console.log(`\nSmoke 130H: Finished execution. ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
