'use strict';
// Smoke 141H: Forbidden Scanner / Write-Scope Guardrail
// Verifies that the guardrail service correctly catches:
//   - Forbidden operational table mutation patterns
//   - Forbidden execution capability keywords
//   - Write scope attestation violations

const assert = require('assert');
const guardrailSvc = require('../src/api/services/cohortInterventionSimulationGuardrailService').serviceInstance || require('../src/api/services/cohortInterventionSimulationGuardrailService');

(async () => {
  console.log('=== Smoke 141H: Forbidden Scanner / Write-Scope Guardrail ===\n');

  try {
    const baseSteps = (status = 'COMPLETED') => [
      { step_key: 'impact_analysis', status },
      { step_key: 'rollback_preview', status },
      { step_key: 'operator_confirmation', status }
    ];

    // Test 1: Valid simulation passes all guardrail checks
    const validSim = {
      simulation_type: 'SIMULATE_COHORT_PAUSE',
      operator_confirmed: 1,
      operator_confirmation_phrase: 'CONFIRM_PHASE_141_HIGH_RISK_SIMULATION',
      simulation_write_scope_attestation_json: {
        writes_only_phase141_tables: true,
        wrote_phase128_to_140_operational_tables: false,
        cohort_access_mutated: false
      }
    };
    const validRes = await guardrailSvc.runGuardrailChecks(validSim, baseSteps());
    assert.strictEqual(validRes.passed, true, 'Valid simulation must pass guardrails');
    console.log('  PASS: Valid simulation passes all guardrail checks.');

    // Test 2: Forbidden simulation type is blocked
    const forbiddenTypeSim = { ...validSim, simulation_type: 'EXECUTE_COHORT_PAUSE' };
    const forbiddenTypeRes = await guardrailSvc.runGuardrailChecks(forbiddenTypeSim, baseSteps());
    assert.strictEqual(forbiddenTypeRes.passed, false);
    assert.ok(forbiddenTypeRes.findings.some(f => f.rule === 'SIMULATION_TYPE_ALLOWED' && !f.passed));
    console.log('  PASS: EXECUTE_COHORT_PAUSE (real execution type) blocked by guardrail.');

    // Test 3: Missing step blocks execution
    const missingStepRes = await guardrailSvc.runGuardrailChecks(validSim, [
      { step_key: 'impact_analysis', status: 'COMPLETED' },
      { step_key: 'rollback_preview', status: 'PENDING' },
      { step_key: 'operator_confirmation', status: 'COMPLETED' }
    ]);
    assert.strictEqual(missingStepRes.passed, false);
    assert.ok(missingStepRes.findings.some(f => f.rule === 'STEP_ROLLBACK_PREVIEW_COMPLETED' && !f.passed));
    console.log('  PASS: Missing rollback_preview step correctly blocked.');

    // Test 4: Write scope attestation violation is caught
    const badAttestationSim = {
      ...validSim,
      simulation_write_scope_attestation_json: {
        writes_only_phase141_tables: false,
        wrote_phase128_to_140_operational_tables: true
      }
    };
    const badAttestation = await guardrailSvc.runGuardrailChecks(badAttestationSim, baseSteps());
    assert.strictEqual(badAttestation.passed, false);
    assert.ok(badAttestation.findings.some(f => f.rule === 'WRITE_SCOPE_PHASE141_ONLY' && !f.passed));
    console.log('  PASS: Write scope attestation violation (wrote_phase128_to_140_operational_tables=true) caught.');

    // Test 5: Forbidden capability keyword in payload is caught
    const forbiddenKwSim = {
      ...validSim,
      simulation_type: 'SIMULATE_COHORT_PAUSE',
      // Inject a forbidden keyword into the payload JSON
      _forbidden_test: 'execute_cohort_pause is forbidden here'
    };
    const forbiddenKwRes = await guardrailSvc.runGuardrailChecks(forbiddenKwSim, baseSteps());
    assert.strictEqual(forbiddenKwRes.passed, false);
    assert.ok(forbiddenKwRes.findings.some(f => f.rule === 'NO_FORBIDDEN_EXECUTION_CAPABILITIES' && !f.passed));
    console.log('  PASS: Forbidden keyword "execute_cohort_pause" detected in payload and blocked.');

    // Test 6: Forbidden table mutation pattern is caught
    const forbiddenTableSim = {
      ...validSim,
      _mutation_test: 'INSERT INTO controlled_beta_runtime_access_sessions VALUES (1,2,3)'
    };
    const forbiddenTableRes = await guardrailSvc.runGuardrailChecks(forbiddenTableSim, baseSteps());
    assert.strictEqual(forbiddenTableRes.passed, false);
    assert.ok(forbiddenTableRes.findings.some(f => f.rule === 'NO_FORBIDDEN_TABLE_MUTATIONS' && !f.passed));
    console.log('  PASS: Forbidden table mutation pattern "INSERT INTO controlled_beta_runtime_access_sessions" blocked.');

    // Test 7: Wrong confirmation phrase blocked
    const wrongPhraseSim = { ...validSim, operator_confirmation_phrase: 'WRONG_PHRASE' };
    const wrongPhraseRes = await guardrailSvc.runGuardrailChecks(wrongPhraseSim, baseSteps());
    assert.strictEqual(wrongPhraseRes.passed, false);
    assert.ok(wrongPhraseRes.findings.some(f => f.rule === 'CONFIRMATION_PHRASE_VALID' && !f.passed));
    console.log('  PASS: Wrong confirmation phrase blocked by guardrail.');

    console.log('\nSmoke 141H: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 141H:', e);
    process.exit(1);
  }
})();
