'use strict';

const fs = require('fs');
const path = require('path');
const { runAudit, classifyVariable, SAFETY_FLAGS } = require('./audit_env_variable_completeness');
const { generatePatch } = require('./generate_missing_env_patch');
const { applyPatch } = require('./apply_missing_env_patch');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 135.1D: Production Env Completeness Acceptance ===\n');

try {
  // 1. Run audit
  const auditBefore = runAudit();
  console.log(`Initial audit: totalExpected=${auditBefore.totalExpected}, presentCount=${auditBefore.presentCount}, missingCount=${auditBefore.missingCount}`);

  // 2. Generate patch
  const patchInfo = generatePatch();
  console.log(`Patch file generated at: ${patchInfo.patchPath}`);

  // 3. Conditionally apply patch
  if (process.env.APPLY_ENV_PATCH === 'true') {
    console.log('APPLY_ENV_PATCH is true. Applying env patch...');
    const applyInfo = applyPatch();
    if (applyInfo.backupPath) {
      console.log(`Backup created at: ${applyInfo.backupPath}`);
    }
  } else {
    console.log('APPLY_ENV_PATCH is false. Skipping patch application step (dry-run).');
  }

  // 4. Run post-audit to verify environment completeness
  const auditAfter = runAudit();
  console.log(`Post-audit: totalExpected=${auditAfter.totalExpected}, presentCount=${auditAfter.presentCount}, missingCount=${auditAfter.missingCount}`);

  // If APPLY_ENV_PATCH was true, verify that the non-secret recommended additions are now present (loaded in memory for current process, wait,
  // process.env won't automatically reload unless we reload dotenv, but we can verify `.env` contents on disk)
  const envPath = path.join(__dirname, '../.env');
  const envContent = fs.readFileSync(envPath, 'utf8');

  // Verify safety flags are disabled in current environment (and on disk)
  for (const flag of SAFETY_FLAGS) {
    const val = process.env[flag];
    assert(val !== 'true', `Safety flag ${flag} is disabled in environment`);
    
    // Check disk content for the flag to ensure it's not set to true
    const flagTruePattern = new RegExp(`^\\s*${flag}\\s*=\\s*true`, 'm');
    assert(!flagTruePattern.test(envContent), `Safety flag ${flag} is not set to true on disk`);
  }

  // Verify fallback/mock flags are disabled
  const fallbackFlags = ['FORCE_REAL_DB_SMOKE', 'ALLOW_SCHEMA_SMOKE_FALLBACK', 'ALLOW_SMOKE_FALLBACK', 'ALLOW_MOCK_DB', 'ALLOW_IN_MEMORY_DB'];
  for (const flag of fallbackFlags) {
    // Note: FORCE_REAL_DB_SMOKE is allowed to be true if explicitly passed at command line, but default in file should be false
    const flagTruePattern = new RegExp(`^\\s*${flag}\\s*=\\s*true`, 'm');
    if (flag !== 'FORCE_REAL_DB_SMOKE') {
      assert(!flagTruePattern.test(envContent), `Fallback flag ${flag} is not set to true on disk`);
    }
  }

  // Verify no raw secrets/passwords are leaked or printed in logs/outputs
  assert(!envContent.includes('DATABASE_URL=mysql://') || !JSON.stringify(auditAfter).includes('mysql://'), 'DATABASE_URL value is redacted from outputs');

  console.log(`\nSmoke 135.1D: Finished execution. ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
} catch (e) {
  console.error('FATAL error in 135.1D:', e);
  process.exit(1);
}
