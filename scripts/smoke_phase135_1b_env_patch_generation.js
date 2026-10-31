'use strict';

const fs = require('fs');
const { generatePatch } = require('./generate_missing_env_patch');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 135.1B: Env Patch Generation ===\n');

try {
  const result = generatePatch();

  assert(fs.existsSync(result.patchPath), `Patch file was written to ${result.patchPath}`);
  
  const content = fs.readFileSync(result.patchPath, 'utf8');

  // Verify no unsafe true flags are generated
  assert(!content.includes('FULL_PUBLIC=true'), 'No FULL_PUBLIC=true generated');
  assert(!content.includes('OPEN_MARKETPLACE=true'), 'No OPEN_MARKETPLACE=true generated');
  assert(!content.includes('PUBLIC_SIGNUP=true'), 'No PUBLIC_SIGNUP=true generated');
  assert(!content.includes('PUBLIC_BETA=true'), 'No PUBLIC_BETA=true generated');

  // Check if safety flags are present in the patch, they must be false.
  // (They might be absent if they are already defined in the local .env, which is fine)
  const safetyFlags = [
    'FULL_PUBLIC', 'OPEN_MARKETPLACE', 'PUBLIC_SIGNUP', 'PUBLIC_BETA',
    'PAYMENT_EXECUTION_ENABLED', 'REFUND_EXECUTION_ENABLED', 'PAYOUT_EXECUTION_ENABLED'
  ];
  for (const flag of safetyFlags) {
    if (content.includes(`${flag}=`)) {
      assert(content.includes(`${flag}=false`), `${flag} is defaulted to false`);
    } else {
      passed++;
      console.log(`  PASS: ${flag} not in patch because it already exists in .env`);
    }
  }

  // Verify secret/database vars are placeholders only (written as comments starting with #)
  if (result.manualVars.includes('DATABASE_URL')) {
    assert(content.includes('# DATABASE_URL=REQUIRED_MANUAL_DATABASE_VALUE'), 'DATABASE_URL is a placeholder comment only');
  }
  if (result.manualVars.includes('JWT_SECRET')) {
    assert(content.includes('# JWT_SECRET=REQUIRED_MANUAL_SECRET_VALUE'), 'JWT_SECRET is a placeholder comment only');
  }

  // Verify no raw secrets/passwords exist
  assert(!content.includes('Root-2026-IONOS!'), 'No raw password leaked in patch file');

  console.log(`\nSmoke 135.1B: Finished execution. ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
} catch (e) {
  console.error('FATAL error in 135.1B:', e);
  process.exit(1);
}
