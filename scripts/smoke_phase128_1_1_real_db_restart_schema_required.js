'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128.1.1: Real DB Schema Verification Required Validation ===\n');

const targetFilePath = path.join(__dirname, 'smoke_phase128_1a_runtime_restart_schema.js');
const targetExists = fs.existsSync(targetFilePath);
assert(targetExists, 'Target smoke 128.1a file exists');

if (targetExists) {
  const content = fs.readFileSync(targetFilePath, 'utf8');

  // 1. Check dotenv/config or dotenv require
  assert(content.includes("require('dotenv').config()") || content.includes('dotenv/config'), '128.1a loads environment config');

  // 2. Check SQL query existence for migration 075, columns, and indexes
  assert(content.includes('075_phase128_1%'), '128.1a checks schema_versions for migration 075');
  assert(content.includes('INFORMATION_SCHEMA.COLUMNS'), '128.1a checks columns in INFORMATION_SCHEMA');
  assert(content.includes('INFORMATION_SCHEMA.STATISTICS'), '128.1a checks indexes in STATISTICS');

  // 3. Test production-like env logic blocks fallback
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
    assert(false, '128.1a should fail closed in production-like environment without config');
  } catch (err) {
    const errOutput = err.stdout?.toString() + err.stderr?.toString();
    assert(errOutput.includes('Real DB schema verification required in production-like mode'), '128.1a fails closed and prints required message');
  }

  // 4. Test fallback permitted ONLY with explicit allowance
  try {
    const stdout = cp.execSync('node scripts/smoke_phase128_1a_runtime_restart_schema.js', {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ALLOW_SCHEMA_SMOKE_FALLBACK: 'true',
        DATABASE_URL: '',
        MYSQL_HOST: ''
      }
    }).toString();
    assert(stdout.includes('Mock schema verification fallback is allowed in this environment'), '128.1a allows fallback with ALLOW_SCHEMA_SMOKE_FALLBACK=true');
  } catch (err) {
    assert(false, '128.1a should pass when fallback is explicitly allowed');
  }

  // 5. Verify no secrets (like raw DATABASE_URL passwords) are leaked in output
  try {
    const stdout = cp.execSync('node scripts/smoke_phase128_1a_runtime_restart_schema.js', {
      env: {
        ...process.env,
        DATABASE_URL: 'mysql://controlplane:secret_pass_123@invalidhost:3306/Control',
        ALLOW_SCHEMA_SMOKE_FALLBACK: 'false'
      }
    }).toString();
    assert(!stdout.includes('secret_pass_123'), 'Fake secret password is not printed in output');
    assert(stdout.includes('[REDACTED]'), 'Output redacts database credentials');
  } catch (err) {
    const errOutput = err.stdout?.toString() + err.stderr?.toString();
    assert(!errOutput.includes('secret_pass_123'), 'Fake secret password is not printed in error output');
    assert(errOutput.includes('[REDACTED]'), 'Error output redacts database credentials');
  }
}

console.log(`\nSmoke 128.1.1: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
