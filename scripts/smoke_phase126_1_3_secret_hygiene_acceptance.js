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

console.log('=== Smoke 126.1.3: Secret Hygiene Acceptance ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.ALLOW_SCHEMA_SMOKE_FALLBACK = 'true';

// 1. Redaction helper exists
const helperPath = path.join(__dirname, 'smoke_secret_redaction.js');
assert(fs.existsSync(helperPath), "Redaction helper smoke_secret_redaction.js exists");

const { redactDatabaseUrl, assertNoSecretLeak } = require('./smoke_secret_redaction');

// 2. Test DATABASE_URL and JWT_SECRET presence check capability without printing values
const dummyDbUrl = "mysql://controlplane:SuperSecretPass!@localhost:3306/db";
const redactedUrl = redactDatabaseUrl(dummyDbUrl);
assert(redactedUrl.includes('[REDACTED]'), "DATABASE_URL presence check capability works");
assert(!redactedUrl.includes('SuperSecretPass!'), "DATABASE_URL value is redacted successfully");

// 3. Scan scripts for raw environment prints
const scriptsDir = path.join(__dirname, '../scripts');
const files = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'));

let leakedRawUrl = false;
let leakedRawJwt = false;

for (const file of files) {
  if (file === 'smoke_phase126_1h_secret_redaction_regression.js') continue;
  const content = fs.readFileSync(path.join(scriptsDir, file), 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    if (trimmed.includes('console.log') || trimmed.includes('console.error') || trimmed.includes('console.warn') || trimmed.includes('console.info')) {
      if (trimmed.includes('process.env.DATABASE_URL') || trimmed.includes('process.env.JWT_SECRET')) {
        const isSafe = trimmed.includes('!!') || trimmed.includes('Boolean') || trimmed.includes('typeof') || trimmed.includes('includes(');
        if (!isSafe) {
          if (trimmed.includes('process.env.DATABASE_URL')) {
            leakedRawUrl = true;
          }
          if (trimmed.includes('process.env.JWT_SECRET')) {
            leakedRawJwt = true;
          }
        }
      }
    }
  }
}

assert(!leakedRawUrl, "No smoke script prints process.env.DATABASE_URL directly");
assert(!leakedRawJwt, "No smoke script prints process.env.JWT_SECRET directly");

// 4. Run Phase 126.1 E2E acceptance pack (which executes and checks 1a, 1g, 1h)
try {
  const outF = cp.execSync('node scripts/smoke_phase126_1f_pilot_evidence_persistence_acceptance_pack.js', { env: process.env }).toString();
  assert(outF.includes('Smoke 126.1f: 12 passed'), "126.1f E2E acceptance pack passes");
  assertNoSecretLeak(outF);
} catch (err) {
  console.error("Acceptance pack E2E validation failed:", err.stdout ? err.stdout.toString() : err.message);
  assert(false, "126.1f E2E acceptance pack passes");
}

console.log(`\nSmoke 126.1.3: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
