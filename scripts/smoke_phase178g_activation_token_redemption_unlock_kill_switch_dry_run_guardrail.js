'use strict';

const assert = require('assert');
const guardrailService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunGuardrailService').serviceInstance;

(async () => {
  console.log('=== Smoke 178G: Phase 178 Guardrail Safety Scan ===');

  try {
    const violations = await guardrailService.scanForForbiddenOperations();
    assert.strictEqual(violations.length, 0, `Safety violations detected: ${JSON.stringify(violations)}`);
    console.log('  PASS: Guardrail scan passed. Zero forbidden operations found in Phase 178 services.');
    console.log('\nSmoke 178G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 178G:', e.message, e.stack);
    process.exit(1);
  }
})();
