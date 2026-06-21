'use strict';
// Smoke 141E: Operator Confirmation Validation

const assert = require('assert');
const confirmSvc = require('../src/api/services/cohortInterventionSimulationOperatorConfirmationService').serviceInstance || require('../src/api/services/cohortInterventionSimulationOperatorConfirmationService');
const builderSvc = require('../src/api/services/cohortInterventionSimulationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationBuilderService');

(async () => {
  console.log('=== Smoke 141E: Operator Confirmation Validation ===\n');

  try {
    const simId = 'mock_sim_141e';
    const mockSim = {
      simulation_id: simId,
      simulation_type: 'SIMULATE_COHORT_PAUSE',
      simulation_status: 'DRAFT',
      cohort_id: 'cohort_beta_141e',
      tenant_id: 'tenant_beta_141e',
      simulation_write_scope_attestation_json: { writes_only_phase141_tables: true },
      simulation_blockers_json: { missing_impact_analysis: false, missing_rollback_preview: false, missing_operator_confirmation: true }
    };
    builderSvc._mockState.simulations.set(simId, mockSim);
    builderSvc._mockState.steps.set(simId, [
      { step_id: 's1', simulation_id: simId, step_key: 'impact_analysis', status: 'COMPLETED', required: 1 },
      { step_id: 's2', simulation_id: simId, step_key: 'rollback_preview', status: 'COMPLETED', required: 1 },
      { step_id: 's3', simulation_id: simId, step_key: 'operator_confirmation', status: 'PENDING', required: 1 }
    ]);

    // Test 1: wrong phrase is rejected
    try {
      await confirmSvc.confirmSimulation(simId, 'admin', 'Test Operator', 'WRONG_PHRASE');
      console.error('FAIL: Wrong phrase must be rejected');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('INVALID_CONFIRMATION_PHRASE')) {
        console.log('  PASS: Wrong confirmation phrase rejected correctly.');
      } else throw e;
    }

    // Test 2: phase 140 phrase is rejected
    try {
      await confirmSvc.confirmSimulation(simId, 'admin', 'Test Operator', 'CONFIRM_PHASE_140_CONTROLLED_EXECUTION');
      console.error('FAIL: Phase 140 phrase must be rejected in Phase 141');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('INVALID_CONFIRMATION_PHRASE')) {
        console.log('  PASS: Phase 140 confirmation phrase correctly rejected in Phase 141 context.');
      } else throw e;
    }

    // Test 3: empty signatory name is rejected
    try {
      await confirmSvc.confirmSimulation(simId, 'admin', '   ', 'CONFIRM_PHASE_141_HIGH_RISK_SIMULATION');
      console.error('FAIL: Empty signatory name must be rejected');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('SIGNATORY_NAME_REQUIRED')) {
        console.log('  PASS: Empty signatory name rejected.');
      } else throw e;
    }

    // Test 4: correct phrase is accepted
    const result = await confirmSvc.confirmSimulation(simId, 'admin', 'Operator Name 141', 'CONFIRM_PHASE_141_HIGH_RISK_SIMULATION');
    assert.strictEqual(result.confirmed, true);
    assert.strictEqual(result.signatory, 'Operator Name 141');
    console.log('  PASS: Correct confirmation phrase CONFIRM_PHASE_141_HIGH_RISK_SIMULATION accepted.');

    // Test 5: step is marked COMPLETED
    const steps = builderSvc._mockState.steps.get(simId);
    const step = steps.find(s => s.step_key === 'operator_confirmation');
    assert.strictEqual(step?.status, 'COMPLETED');
    console.log('  PASS: operator_confirmation step marked COMPLETED.');

    // Test 6: already simulated simulation is blocked
    const simId2 = 'mock_sim_141e_simulated';
    builderSvc._mockState.simulations.set(simId2, { ...mockSim, simulation_id: simId2, simulation_status: 'SIMULATED' });
    try {
      await confirmSvc.confirmSimulation(simId2, 'admin', 'Op', 'CONFIRM_PHASE_141_HIGH_RISK_SIMULATION');
      console.error('FAIL: Completed simulation must not allow re-confirmation');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('SIMULATION_ALREADY_IN_PROGRESS_OR_COMPLETED')) {
        console.log('  PASS: Re-confirmation on completed simulation blocked.');
      } else throw e;
    }

    console.log('\nSmoke 141E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 141E:', e);
    process.exit(1);
  }
})();
