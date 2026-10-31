'use strict';

const { fork } = require('child_process');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128.0.1: Real DB Schema Verification Required Regression ===\n');

const targetScript = path.join(__dirname, 'smoke_phase128a_limited_beta_runtime_schema.js');

function runTest(env) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = fork(targetScript, [], {
      env: {
        ...process.env,
        ...env
      },
      silent: true
    });

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('exit', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

(async () => {
  // Test 1: Fallback is allowed with ALLOW_SCHEMA_SMOKE_FALLBACK=true and NODE_ENV=test
  const test1 = await runTest({
    NODE_ENV: 'test',
    ALLOW_SCHEMA_SMOKE_FALLBACK: 'true',
    DATABASE_URL: '',
    MYSQL_HOST: ''
  });
  assert(test1.code === 0, "Test 1: Exits with code 0 under test/fallback environment");
  assert(test1.stdout.includes("Mock schema verification fallback is allowed"), "Test 1: Outputs fallback allowed message");

  // Test 2: Fails closed in production-like environment when database is unconfigured/unavailable
  const test2 = await runTest({
    NODE_ENV: 'production',
    ALLOW_SCHEMA_SMOKE_FALLBACK: 'false',
    DATABASE_URL: '',
    MYSQL_HOST: ''
  });
  assert(test2.code === 1, "Test 2: Exits with code 1 in production-like mode without DB");
  assert(test2.stderr.includes("FAIL: Real DB schema verification required in production-like mode") || 
         test2.stdout.includes("FAIL: Real DB schema verification required in production-like mode"),
         "Test 2: Outputs fail closed error message");

  // Test 3: Redacts credentials from connection logs
  const test3 = await runTest({
    NODE_ENV: 'production',
    ALLOW_SCHEMA_SMOKE_FALLBACK: 'false',
    DATABASE_URL: 'mysql://controlplane:superSecretPassword123@localhost:3306/Control'
  });
  assert(test3.stdout.includes("Connecting to database: mysql://controlplane:[REDACTED]@localhost:3306/Control"), "Test 3: Credentials are redacted in stdout log");
  assert(!test3.stdout.includes("superSecretPassword123"), "Test 3: Raw password is NOT printed in stdout");
  assert(!test3.stderr.includes("superSecretPassword123"), "Test 3: Raw password is NOT printed in stderr");

  console.log(`\nSmoke 128.0.1: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 128.0.1:", err);
  process.exit(1);
});
