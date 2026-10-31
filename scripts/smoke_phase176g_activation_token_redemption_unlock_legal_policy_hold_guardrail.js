'use strict';

const assert = require('assert');
const guardrailService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldGuardrailService').serviceInstance;

(async () => {
  console.log('=== Smoke 176G: Phase 176 Guardrail Safety Scan ===');

  try {
    const violations = await guardrailService.scanForForbiddenOperations();
    assert.strictEqual(violations.length, 0, `Forbidden operations detected: ${JSON.stringify(violations)}`);
    console.log('  PASS: Guardrail scan passed. Zero forbidden operations found in Phase 176 services.');

    console.log('\nSmoke 176G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 176G:', e.message, e.stack);
    process.exit(1);
  }
})();
