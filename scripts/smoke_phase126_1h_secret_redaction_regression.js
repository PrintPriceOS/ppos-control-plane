'use strict';

const fs = require('fs');
const path = require('path');
const { redactDatabaseUrl } = require('./smoke_secret_redaction');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 126.1h: Secret Redaction Regression Check ===\n');

// Test redactDatabaseUrl
const testUrl = "mysql://user:mysecretpassword123@localhost:3306/db";
const redacted = redactDatabaseUrl(testUrl);
assert(redacted.includes('[REDACTED]'), "redactDatabaseUrl masks passwords");
assert(!redacted.includes('mysecretpassword123'), "redactDatabaseUrl does not leak original password");

// Scan scripts for forbidden raw print patterns
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
            console.error(`  FAIL: ${file} contains raw DATABASE_URL printing: ${trimmed}`);
          }
          if (trimmed.includes('process.env.JWT_SECRET')) {
            leakedRawJwt = true;
            console.error(`  FAIL: ${file} contains raw JWT_SECRET printing: ${trimmed}`);
          }
        }
      }
    }
  }
}

assert(!leakedRawUrl, "No smoke script prints process.env.DATABASE_URL directly in console.log");
assert(!leakedRawJwt, "No smoke script prints process.env.JWT_SECRET directly in console.log");

console.log(`\nSmoke 126.1h: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
