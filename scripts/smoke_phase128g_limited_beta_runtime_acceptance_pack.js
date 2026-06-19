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

console.log('=== Smoke 128g: Phase 128 Acceptance Pack Aggregator ===\n');

// 1. File existence checks
const requiredFiles = [
  'migrations/074_phase128_invite_only_limited_beta_runtime.sql',
  'src/api/services/limitedBetaRuntimeService.js',
  'src/api/routes/limitedBetaRuntimeAdmin.js',
  'src/ui/types/limitedBetaRuntime.ts',
  'src/ui/pages/beta/LimitedBetaRuntime.tsx',
  'scripts/smoke_phase128a_limited_beta_runtime_schema.js',
  'scripts/smoke_phase128b_limited_beta_runtime_service.js',
  'scripts/smoke_phase128c_limited_beta_runtime_access_control.js',
  'scripts/smoke_phase128d_limited_beta_runtime_kill_switch.js',
  'scripts/smoke_phase128e_limited_beta_runtime_admin_api_ui.js',
  'scripts/smoke_phase128f_limited_beta_runtime_evidence_pack.js'
];
for (const f of requiredFiles) {
  assert(fs.existsSync(path.join(__dirname, '..', f)), `File exists: ${f}`);
}

// 2. Service safety invariants & forbidden patterns check
const sourceFiles = [
  'src/api/services/limitedBetaRuntimeService.js',
  'src/api/routes/limitedBetaRuntimeAdmin.js',
];
for (const f of sourceFiles) {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert(src.includes('betaRuntimeEnabled: false') || src.includes('beta_runtime_enabled: false') || src.includes('betaRuntimeEnabled: \'SCOPED_ONLY\'') || src.includes('beta_runtime_enabled: 0') || src.includes('betaRuntimeEnabled: true') || src.includes('beta_runtime_enabled: true'), `${f}: contains runtime enable flags`);
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

// 3. Spawning 128a to verify real DB verification and fallback blocking rules
console.log('\n--- Verifying Schema Smoke (128a) Subprocess Invariants ---');

const schemaSmokeFile = path.join(__dirname, 'smoke_phase128a_limited_beta_runtime_schema.js');
const schemaSmokeContent = fs.readFileSync(schemaSmokeFile, 'utf8');

assert(schemaSmokeContent.includes('schema_versions'), "128a checks schema_versions");
assert(schemaSmokeContent.includes('INFORMATION_SCHEMA.TABLES') || schemaSmokeContent.includes('limited_beta_runtime_%'), "128a checks INFORMATION_SCHEMA.TABLES");
assert(schemaSmokeContent.includes('INFORMATION_SCHEMA.COLUMNS'), "128a checks INFORMATION_SCHEMA.COLUMNS");
assert(schemaSmokeContent.includes('INFORMATION_SCHEMA.STATISTICS'), "128a checks INFORMATION_SCHEMA.STATISTICS");

// Test 128a fails closed in production-like mode without DB or fallback allowed
try {
  cp.execSync('node scripts/smoke_phase128a_limited_beta_runtime_schema.js', {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL: '',
      MYSQL_HOST: '',
      ALLOW_SCHEMA_SMOKE_FALLBACK: 'false'
    },
    stdio: 'pipe'
  });
  assert(false, "128a must fail in production-like mode without DB or fallback");
} catch (err) {
  const output = err.stdout?.toString() + err.stderr?.toString();
  assert(output.includes("Real DB schema verification required in production-like mode"), "128a correctly fails closed and outputs required error message");
}

// Test 128a allows fallback in test environment
try {
  const stdout = cp.execSync('node scripts/smoke_phase128a_limited_beta_runtime_schema.js', {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ALLOW_SCHEMA_SMOKE_FALLBACK: 'true',
      DATABASE_URL: '',
      MYSQL_HOST: ''
    }
  }).toString();
  assert(stdout.includes("Mock schema verification fallback is allowed in this environment"), "128a allows fallback when ALLOW_SCHEMA_SMOKE_FALLBACK is true");
} catch (err) {
  assert(false, "128a should pass in test mode with fallback allowed");
}

// Test real DB verification if DATABASE_URL is configured
if (process.env.DATABASE_URL) {
  try {
    const stdout = cp.execSync('node scripts/smoke_phase128a_limited_beta_runtime_schema.js', {
      env: {
        ...process.env,
        ALLOW_SCHEMA_SMOKE_FALLBACK: 'false'
      }
    }).toString();
    assert(stdout.includes("Migration 074 is applied in the database"), "128a verifies migration 074 in real DB");
    assert(stdout.includes("All limited_beta_runtime_% tables verified"), "128a verifies real DB tables in INFORMATION_SCHEMA");
    assert(stdout.includes("All expected columns verified"), "128a verifies real DB columns in INFORMATION_SCHEMA");
    assert(stdout.includes("Required runtime indexes verified"), "128a verifies indexes in STATISTICS");
    assert(!stdout.includes("Mock schema verification fallback is allowed"), "128a does not output fallback statement when real DB connects");
  } catch (err) {
    console.error("  Error running 128a with real DB:", err.stdout?.toString() || err.message);
    failed++;
  }
}

// 4. Executing all other smoke sub-scripts in order
console.log('\n--- Running Remaining Sub-Smoke Tests ---');
const smokes = [
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

  console.log(`\nSmoke 128g: Finished execution. ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 128g:", err);
  process.exit(1);
});
