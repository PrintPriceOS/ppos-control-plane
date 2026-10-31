'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Phase129ControlledBetaFixture = require('./helpers/phase129ControlledBetaFixture');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 129.0.3: Evidence Fixture Schema Alignment ===\n');

(async () => {
  // 1. Static code analysis of fixture helper
  const fixturePath = path.join(__dirname, 'helpers', 'phase129ControlledBetaFixture.js');
  const src = fs.readFileSync(fixturePath, 'utf8');

  assert(src.includes('getTableColumns'), "Fixture has getTableColumns helper");
  assert(src.includes('hasColumn'), "Fixture has hasColumn helper");
  assert(src.includes('buildInsertForExistingColumns'), "Fixture has buildInsertForExistingColumns helper");
  assert(src.includes('upsertEvidencePackAdaptive'), "Fixture has upsertEvidencePackAdaptive helper");
  assert(src.includes('findExistingEvidencePackAdaptive'), "Fixture has findExistingEvidencePackAdaptive helper");
  assert(src.includes('findCompletedPhase128RestartDrill'), "Fixture has findCompletedPhase128RestartDrill helper");
  assert(src.includes('limited_beta_evidence_packs'), "Fixture targets evidence packs table");
  assert(src.includes('ALLOW_PHASE129_SYNTHETIC_EVIDENCE'), "Fixture checks synthetic evidence permission flag for evidence packs");

  // 2. Runtime logic checks
  if (process.env.DATABASE_URL) {
    const fixture = new Phase129ControlledBetaFixture(process.env.DATABASE_URL);
    const testPrefix = `129_0_3_${Date.now()}`;

    try {
      // Test 1: Generate synthetic evidence WITHOUT flag (should fail if no real evidence exists)
      const oldFlag = process.env.ALLOW_PHASE129_SYNTHETIC_EVIDENCE;
      process.env.ALLOW_PHASE129_SYNTHETIC_EVIDENCE = 'false';
      
      try {
        await fixture.setupPrerequisites('dummy_act', testPrefix);
      } catch (err) {
        if (err.message.includes('synthetic evidence generation not explicitly allowed')) {
          assert(true, "Fixture correctly rejected synthetic evidence generation when disallowed");
        } else {
          console.warn("  WARN: Unexpected error or real evidence missing?", err.message);
        }
      }

      // Test 2: Allow synthetic evidence
      process.env.ALLOW_PHASE129_SYNTHETIC_EVIDENCE = 'true';
      const result1 = await fixture.setupPrerequisites('dummy_act', testPrefix);
      assert(result1.packId && result1.usedDrillId, "Fixture setup succeeded and returned IDs");

      // Test 3: Idempotency check (run again with same prefix, shouldn't crash)
      const result2 = await fixture.setupPrerequisites('dummy_act', testPrefix);
      assert(result2.packId && result2.usedDrillId, "Fixture setup is idempotent");

      // Cleanup
      await fixture.cleanupPhase129Fixture(testPrefix);
      
      assert(true, "Cleanup completed without errors");

      process.env.ALLOW_PHASE129_SYNTHETIC_EVIDENCE = oldFlag;
    } finally {
      await fixture.close();
    }
  } else {
    console.log("  SKIP: Real DB checks skipped due to missing DATABASE_URL");
  }

  console.log(`\nSmoke 129.0.3: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 129.0.3:", err);
  process.exit(1);
});
