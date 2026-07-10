'use strict';

const assert = require('assert');
const guardrailService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealGuardrailService').serviceInstance;

(async () => {
  console.log('=== Smoke 179G: Phase 179 Guardrail Safety Scan ===');

  try {
    const violations = await guardrailService.scanForForbiddenOperations();
    assert.strictEqual(violations.length, 0, `Safety violations detected: ${JSON.stringify(violations)}`);
    console.log('  PASS: Guardrail scan passed. Zero forbidden operations found in Phase 179 services.');
    console.log('\nSmoke 179G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 179G:', e.message, e.stack);
    process.exit(1);
  }
})();
