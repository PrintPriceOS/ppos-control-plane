'use strict';

const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128.1g: Phase 128.1 Restart Recovery Acceptance Pack Aggregator ===\n');

// 1. File existence checks
const requiredFiles = [
  'migrations/075_phase128_1_runtime_persistence_restart_recovery_drill.sql',
  'scripts/smoke_phase128_1a_runtime_restart_schema.js',
  'scripts/smoke_phase128_1_1_real_db_restart_schema_required.js',
  'scripts/smoke_phase128_1h_real_pm2_restart_drill_marker.js',
  'scripts/smoke_phase128_1b_runtime_snapshot_service.js',
  'scripts/smoke_phase128_1c_runtime_after_restart_recovery.js',
  'scripts/smoke_phase128_1d_runtime_kill_switch_restart_survival.js',
  'scripts/smoke_phase128_1e_runtime_admin_api_ui_restart_drill.js',
  'scripts/smoke_phase128_1f_runtime_restart_evidence_pack.js'
];
for (const f of requiredFiles) {
  assert(fs.existsSync(path.join(__dirname, '..', f)), `File exists: ${f}`);
}

// 2. Subprocess schema validation checks
console.log('\n--- Verifying Schema Smoke (128.1a) Subprocess Invariants ---');

const schemaSmokeFile = path.join(__dirname, 'smoke_phase128_1a_runtime_restart_schema.js');
const schemaSmokeContent = fs.readFileSync(schemaSmokeFile, 'utf8');

assert(schemaSmokeContent.includes('schema_versions'), "128.1a checks schema_versions");
assert(schemaSmokeContent.includes('INFORMATION_SCHEMA.COLUMNS'), "128.1a checks INFORMATION_SCHEMA.COLUMNS");
assert(schemaSmokeContent.includes('INFORMATION_SCHEMA.STATISTICS'), "128.1a checks STATISTICS indexes");

// Test 128.1a fails closed in production-like mode without DB or fallback allowed
try {
  cp.execSync('node scripts/smoke_phase128_1a_runtime_restart_schema.js', {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL: '',
      MYSQL_HOST: '',
      ALLOW_SCHEMA_SMOKE_FALLBACK: 'false'
    },
    stdio: 'pipe'
  });
  assert(false, "128.1a must fail in production-like mode without DB or fallback");
} catch (err) {
  const output = err.stdout?.toString() + err.stderr?.toString();
  assert(output.includes("Real DB schema verification required in production-like mode"), "128.1a correctly fails closed and outputs required error message");
}

// Test 128.1a allows fallback in test environment
try {
  const stdout = cp.execSync('node scripts/smoke_phase128_1a_runtime_restart_schema.js', {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ALLOW_SCHEMA_SMOKE_FALLBACK: 'true',
      DATABASE_URL: '',
      MYSQL_HOST: ''
    }
  }).toString();
  assert(stdout.includes("Mock schema verification fallback is allowed in this environment"), "128.1a allows fallback when ALLOW_SCHEMA_SMOKE_FALLBACK is true");
} catch (err) {
  assert(false, "128.1a should pass in test mode with fallback allowed");
}

// Test real DB verification if DATABASE_URL is configured
if (process.env.DATABASE_URL) {
  try {
    const stdout = cp.execSync('node scripts/smoke_phase128_1a_runtime_restart_schema.js', {
      env: {
        ...process.env,
        ALLOW_SCHEMA_SMOKE_FALLBACK: 'false'
      }
    }).toString();
    assert(stdout.includes("Migration 075 is applied in the database"), "128.1a verifies migration 075 in real DB");
    assert(stdout.includes("All expected restart columns verified"), "128.1a verifies real DB columns in INFORMATION_SCHEMA");
    assert(stdout.includes("Required indexes verified in STATISTICS"), "128.1a verifies indexes in STATISTICS");
    assert(!stdout.includes("Mock schema verification fallback is allowed"), "128.1a does not output fallback statement when real DB connects");
  } catch (err) {
    console.error("  Error running 128.1a with real DB:", err.stdout?.toString() || err.message);
    failed++;
  }
}

// 3. Executing all other smoke sub-scripts in order
console.log('\n--- Running Remaining Sub-Smoke Tests ---');
const smokes = [
  'smoke_phase128_1_1_real_db_restart_schema_required.js',
  'smoke_phase128_1b_runtime_snapshot_service.js',
  'smoke_phase128_1c_runtime_after_restart_recovery.js',
  'smoke_phase128_1d_runtime_kill_switch_restart_survival.js',
  'smoke_phase128_1e_runtime_admin_api_ui_restart_drill.js',
  'smoke_phase128_1f_runtime_restart_evidence_pack.js'
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
