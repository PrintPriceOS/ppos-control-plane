'use strict';

const { fork } = require('child_process');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128g: Phase 128 Acceptance Pack Aggregator ===\n');

const smokes = [
  'smoke_phase128a_limited_beta_runtime_schema.js',
  'smoke_phase128b_limited_beta_runtime_service.js',
  'smoke_phase128c_limited_beta_runtime_access_control.js',
  'smoke_phase128d_limited_beta_runtime_kill_switch.js',
  'smoke_phase128e_limited_beta_runtime_admin_api_ui.js',
  'smoke_phase128f_limited_beta_runtime_evidence_pack.js'
];

function runScript(scriptName) {
  return new Promise((resolve) => {
    console.log(`Running sub-smoke: ${scriptName}...`);
    const child = fork(path.join(__dirname, scriptName), [], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ALLOW_DB_FALLBACK_FOR_SMOKE: 'true',
        ALLOW_SCHEMA_SMOKE_FALLBACK: 'true'
      },
      silent: false
    });

    child.on('exit', (code) => {
      if (code === 0) {
        assert(true, `${scriptName} executed successfully with exit code 0`);
      } else {
        assert(false, `${scriptName} failed with exit code ${code}`);
      }
      resolve();
    });
  });
}

(async () => {
  for (const s of smokes) {
    await runScript(s);
  }

  // Check safety invariants in memory/config
  const LimitedBetaRuntimeService = require('../src/api/services/limitedBetaRuntimeService');
  const svc = new LimitedBetaRuntimeService();

  const readiness = await svc.evaluateRuntimeActivationReadiness('gate_123');
  assert(readiness.safety.fullPublicEnabled === false, "Safety invariant: FULL_PUBLIC is disabled");
  assert(readiness.safety.openMarketplaceEnabled === false, "Safety invariant: Open Marketplace is disabled");
  assert(readiness.safety.paymentExecutionEnabled === false, "Safety invariant: Payment Execution is disabled");

  console.log(`\nSmoke 128g: Finished execution. ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 128g:", err);
  process.exit(1);
});
