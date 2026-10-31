'use strict';

const assert = require('assert');
const guardrailService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureGuardrailService').serviceInstance;

(async () => {
  console.log('=== Smoke 180G: Phase 180 Guardrail Safety Scan ===');

  try {
    const violations = await guardrailService.scanForForbiddenOperations();
    assert.strictEqual(violations.length, 0, `Forbidden operations detected: ${JSON.stringify(violations)}`);
    console.log('  PASS: Guardrail scan passed. Zero forbidden operations found in Phase 180 services.');
    console.log('\nSmoke 180G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 180G:', e.message);
    process.exit(1);
  }
})();
