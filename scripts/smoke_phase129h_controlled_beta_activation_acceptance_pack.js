'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { fork } = require('child_process');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 129h: Phase 129 Acceptance Pack Aggregator ===\n');

// 1. File existence checks
const requiredFiles = [
  'migrations/076_phase129_first_controlled_invite_only_beta_cohort_activation.sql',
  'src/api/services/controlledBetaCohortActivationService.js',
  'src/api/routes/controlledBetaCohortActivationAdmin.js',
  'src/ui/types/controlledBetaCohortActivation.ts',
  'src/ui/pages/beta/ControlledBetaCohortActivation.tsx',
  'scripts/smoke_phase129a_controlled_beta_activation_schema.js',
  'scripts/smoke_phase129b_controlled_beta_activation_service.js',
  'scripts/smoke_phase129c_controlled_beta_activation_readiness.js',
  'scripts/smoke_phase129d_controlled_beta_activation_access_limits.js',
  'scripts/smoke_phase129e_controlled_beta_activation_kill_switch_incident.js',
  'scripts/smoke_phase129f_controlled_beta_activation_admin_api_ui.js',
  'scripts/smoke_phase129g_controlled_beta_activation_evidence_pack.js',
  'scripts/smoke_phase129_0_1_controlled_beta_readiness_repair.js',
  'scripts/smoke_phase129_0_2_fixture_schema_alignment.js',
  'scripts/smoke_phase129_0_3_evidence_fixture_schema_alignment.js',
  'scripts/smoke_phase128_1g_runtime_restart_acceptance_pack.js',
  'scripts/smoke_phase128_1_5_acceptance_real_db_no_fallback.js'
];
for (const f of requiredFiles) {
  assert(fs.existsSync(path.join(__dirname, '..', f)), `File exists: ${f}`);
}

// 2. Service safety invariants & forbidden patterns check
const sourceFiles = [
  'src/api/services/controlledBetaCohortActivationService.js',
  'src/api/routes/controlledBetaCohortActivationAdmin.js',
];
for (const f of sourceFiles) {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert(src.includes('betaRuntimeEnabled: false') || src.includes('beta_runtime_scoped_enabled: false') || src.includes('beta_runtime_scoped_enabled = 0') || src.includes('beta_runtime_scoped_enabled: 0') || src.includes('beta_runtime_scoped_enabled = 1') || src.includes('beta_runtime_scoped_enabled = 1'), `${f}: contains runtime enable flags`);
  assert(src.includes('fullPublicEnabled: false') || src.includes('full_public_enabled: false') || src.includes('full_public_enabled: 0'), `${f}: fullPublicEnabled=false`);
  assert(src.includes('openMarketplaceEnabled: false') || src.includes('open_marketplace_enabled: false') || src.includes('open_marketplace_enabled: 0'), `${f}: openMarketplaceEnabled=false`);
  assert(src.includes('paymentExecutionEnabled: false') || src.includes('payment_execution_enabled: false') || src.includes('payment_execution_enabled: 0'), `${f}: paymentExecutionEnabled=false`);
}

const forbiddenCalls = [
  'charge(', 'capture(', 'refund(', 'payout(', 'sendToProvider', 'submitTax', 'submitVat', 'submitAccounting'
];
for (const f of sourceFiles) {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  for (const call of forbiddenCalls) {
    assert(!src.includes(call), `${f}: no forbidden call "${call}"`);
  }
}

// 3. Spawning 129a to verify real DB verification and fallback blocking rules
console.log('\n--- Verifying Schema Smoke (129a) Subprocess Invariants ---');

const schemaSmokeFile = path.join(__dirname, 'smoke_phase129a_controlled_beta_activation_schema.js');
const schemaSmokeContent = fs.readFileSync(schemaSmokeFile, 'utf8');

assert(schemaSmokeContent.includes('schema_versions'), "129a checks schema_versions");
assert(schemaSmokeContent.includes('INFORMATION_SCHEMA.TABLES') || schemaSmokeContent.includes('controlled_beta_%'), "129a checks INFORMATION_SCHEMA.TABLES");

// Test 129a fails closed in production-like mode without DB or fallback allowed
try {
  cp.execSync('node scripts/smoke_phase129a_controlled_beta_activation_schema.js', {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL: '',
      MYSQL_HOST: '',
      ALLOW_SCHEMA_SMOKE_FALLBACK: 'false'
    },
    stdio: 'pipe'
  });
  assert(false, "129a must fail in production-like mode without DB or fallback");
} catch (err) {
  const output = err.stdout?.toString() + err.stderr?.toString();
  assert(output.includes("Real DB schema verification required in production-like mode"), "129a correctly fails closed and outputs required error message");
}

// Test 129a allows fallback in test environment
try {
  const stdout = cp.execSync('node scripts/smoke_phase129a_controlled_beta_activation_schema.js', {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ALLOW_SCHEMA_SMOKE_FALLBACK: 'true',
      DATABASE_URL: '',
      MYSQL_HOST: ''
    }
  }).toString();
  assert(stdout.includes("Mock schema verification fallback is allowed in this environment"), "129a allows fallback when ALLOW_SCHEMA_SMOKE_FALLBACK is true");
} catch (err) {
  assert(false, "129a should pass in test mode with fallback allowed");
}

// Test real DB verification if DATABASE_URL is configured
if (process.env.DATABASE_URL) {
  try {
    const stdout = cp.execSync('node scripts/smoke_phase129a_controlled_beta_activation_schema.js', {
      env: {
        ...process.env,
        ALLOW_SCHEMA_SMOKE_FALLBACK: 'false'
      }
    }).toString();
    assert(stdout.includes("Migration 076 is applied in the database"), "129a verifies migration 076 in real DB");
    assert(stdout.includes("All controlled_beta_% tables verified"), "129a verifies real DB tables in INFORMATION_SCHEMA");
    assert(!stdout.includes("Mock schema verification fallback is allowed"), "129a does not output fallback statement when real DB connects");
  } catch (err) {
    console.error("  Error running 129a with real DB:", err.stdout?.toString() || err.message);
    failed++;
  }
}

// 4. Executing all other smoke sub-scripts in order
console.log('\n--- Running Remaining Sub-Smoke Tests ---');
const smokes = [
  'smoke_phase129b_controlled_beta_activation_service.js',
  'smoke_phase129c_controlled_beta_activation_readiness.js',
  'smoke_phase129d_controlled_beta_activation_access_limits.js',
  'smoke_phase129e_controlled_beta_activation_kill_switch_incident.js',
  'smoke_phase129f_controlled_beta_activation_admin_api_ui.js',
  'smoke_phase129g_controlled_beta_activation_evidence_pack.js',
  'smoke_phase129_0_1_controlled_beta_readiness_repair.js',
  'smoke_phase129_0_2_fixture_schema_alignment.js',
  'smoke_phase129_0_3_evidence_fixture_schema_alignment.js',
  'smoke_phase128_1g_runtime_restart_acceptance_pack.js',
  'smoke_phase128_1_5_acceptance_real_db_no_fallback.js'
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
  const ControlledBetaCohortActivationService = require('../src/api/services/controlledBetaCohortActivationService');
  const svc = new ControlledBetaCohortActivationService();

  const readiness = await svc.evaluateControlledCohortActivationReadiness('act_123');
  assert(readiness.safety.fullPublicEnabled === false, "Safety invariant: FULL_PUBLIC is disabled");
  assert(readiness.safety.openMarketplaceEnabled === false, "Safety invariant: Open Marketplace is disabled");
  assert(readiness.safety.paymentExecutionEnabled === false, "Safety invariant: Payment Execution is disabled");

  console.log(`\nSmoke 129h: Finished execution. ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 129h:", err);
  process.exit(1);
});
