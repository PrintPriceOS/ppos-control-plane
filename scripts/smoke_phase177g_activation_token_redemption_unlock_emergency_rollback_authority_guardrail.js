'use strict';

const assert = require('assert');
const guardrailService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityGuardrailService').serviceInstance;

(async () => {
  console.log('=== Smoke 177G: Phase 177 Guardrail Safety Scan ===');

  try {
    const violations = await guardrailService.scanForForbiddenOperations();
    assert.strictEqual(violations.length, 0, `Safety violations detected: ${JSON.stringify(violations)}`);
    console.log('  PASS: Guardrail scan passed. Zero forbidden operations found in Phase 177 services.');
    console.log('\nSmoke 177G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 177G:', e.message, e.stack);
    process.exit(1);
  }
})();
