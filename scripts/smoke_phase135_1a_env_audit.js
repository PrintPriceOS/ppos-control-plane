'use strict';

const { runAudit, classifyVariable, isSensitive } = require('./audit_env_variable_completeness');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 135.1A: Environment Variable Audit ===\n');

try {
  const audit = runAudit();

  assert(audit.totalExpected > 0, `Expected variables found in code: ${audit.totalExpected}`);
  assert(audit.classified !== undefined, 'Audit returns classified variables');
  assert(audit.missing !== undefined, 'Audit returns missing variables list');

  // Verify safety flag classification
  assert(classifyVariable('FULL_PUBLIC') === 'safety_flag', 'FULL_PUBLIC is classified as safety_flag');
  assert(classifyVariable('OPEN_MARKETPLACE') === 'safety_flag', 'OPEN_MARKETPLACE is classified as safety_flag');

  // Verify database classification
  assert(classifyVariable('DATABASE_URL') === 'database', 'DATABASE_URL is classified as database');

  // Verify sensitivity
  assert(isSensitive('DATABASE_URL') === true, 'DATABASE_URL is sensitive');
  assert(isSensitive('JWT_SECRET') === true, 'JWT_SECRET is sensitive');
  assert(isSensitive('STRIPE_SECRET_KEY') === true, 'STRIPE_SECRET_KEY is sensitive');
  assert(isSensitive('LOG_LEVEL') === false, 'LOG_LEVEL is NOT sensitive');

  // Verify output redacts values (we check runAudit does not contain raw sensitive values)
  const auditJson = JSON.stringify(audit);
  assert(!auditJson.includes('mysql://') && !auditJson.includes('Root-2026-IONOS!'), 'Audit output contains no raw DB credentials or passwords');

  console.log(`\nSmoke 135.1A: Finished execution. ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
} catch (e) {
  console.error('FATAL error in 135.1A:', e);
  process.exit(1);
}
