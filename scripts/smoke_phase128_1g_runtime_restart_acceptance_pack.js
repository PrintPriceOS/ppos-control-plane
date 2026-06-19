'use strict';

const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128.1g: Phase 128.1 Restart Recovery Acceptance Pack Aggregator ===\n');

const smokes = [
  'smoke_phase128_1a_runtime_restart_schema.js',
  'smoke_phase128_1b_runtime_snapshot_service.js',
  'smoke_phase128_1c_runtime_after_restart_recovery.js',
  'smoke_phase128_1d_runtime_kill_switch_restart_survival.js',
  'smoke_phase128_1e_runtime_admin_api_ui_restart_drill.js',
  'smoke_phase128_1f_runtime_restart_evidence_pack.js',
  // Phase 128 regression checks
  'smoke_phase128g_limited_beta_runtime_acceptance_pack.js'
];

function runScript(scriptName) {
  return new Promise((resolve) => {
    console.log(`Running sub-smoke: ${scriptName}...`);
    const child = fork(path.join(__dirname, scriptName), [], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ALLOW_DB_FALLBACK_FOR_SMOKE: 'true',
        ALLOW_SCHEMA_SMOKE_FALLBACK: 'true',
        JWT_SECRET: 'test_secret'
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

  console.log(`\nSmoke 128.1g: Finished execution. ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 128.1g:", err);
  process.exit(1);
});
