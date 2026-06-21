'use strict';
// Smoke 141G: One-time use protection — re-run blocked

const assert = require('assert');
const builderSvc = require('../src/api/services/cohortInterventionSimulationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationBuilderService');
const impactSvc = require('../src/api/services/cohortInterventionSimulationImpactAnalysisService').serviceInstance || require('../src/api/services/cohortInterventionSimulationImpactAnalysisService');
const rollbackSvc = require('../src/api/services/cohortInterventionSimulationRollbackPreviewService').serviceInstance || require('../src/api/services/cohortInterventionSimulationRollbackPreviewService');
const confirmSvc = require('../src/api/services/cohortInterventionSimulationOperatorConfirmationService').serviceInstance || require('../src/api/services/cohortInterventionSimulationOperatorConfirmationService');
const runnerSvc = require('../src/api/services/cohortInterventionSimulationRunnerService').serviceInstance || require('../src/api/services/cohortInterventionSimulationRunnerService');

(async () => {
  console.log('=== Smoke 141G: One-Time Use Protection ===\n');

  try {
    const simId = 'mock_sim_141g';
    const mockSim = {
      simulation_id: simId,
      simulation_type: 'SIMULATE_PARTICIPANT_ACCESS_RESTRICTION',
      simulation_status: 'DRAFT',
      cohort_id: 'cohort_beta_141g',
      tenant_id: 'tenant_beta_141g',
      source_execution_id: 'mock_exec_141g',
      source_execution_hash: 'hash_exec_141g',
      source_execution_evidence_pack_hash: 'hash_evpack_141g',
      source_approval_hash: 'hash_app_141g',
      source_preparation_hash: 'hash_prep_141g',
      source_review_hash: 'hash_review_141g',
      operator_confirmed: 0,
      safe_scope_simulation_attestation: 'PHASE_141_SIMULATION_ONLY_NO_OPERATIONAL_MUTATION',
      simulation_write_scope_attestation_json: { writes_only_phase141_tables: true, wrote_phase128_to_140_operational_tables: false, cohort_access_mutated: false, participant_access_mutated: false, invite_access_mutated: false, cohort_expanded: false, payment_or_billing_mutated: false },
      simulation_blockers_json: { missing_impact_analysis: true, missing_rollback_preview: true, missing_operator_confirmation: true }
    };
    builderSvc._mockState.simulations.set(simId, mockSim);
    builderSvc._mockState.steps.set(simId, [
      { step_id: 's1', simulation_id: simId, step_key: 'impact_analysis', status: 'PENDING', required: 1 },
      { step_id: 's2', simulation_id: simId, step_key: 'rollback_preview', status: 'PENDING', required: 1 },
      { step_id: 's3', simulation_id: simId, step_key: 'operator_confirmation', status: 'PENDING', required: 1 }
    ]);

    await impactSvc.generateImpactAnalysis(simId, 'admin');
    await rollbackSvc.generateRollbackPreview(simId, 'admin');
    await confirmSvc.confirmSimulation(simId, 'admin', 'Op 141G', 'CONFIRM_PHASE_141_HIGH_RISK_SIMULATION');
    const firstRun = await runnerSvc.runSimulation(simId, 'admin');

    assert.strictEqual(firstRun.simulation_status, 'SIMULATED');
    console.log('  PASS: First simulation run completed successfully.');

    // Attempt second run — must fail
    try {
      await runnerSvc.runSimulation(simId, 'admin');
      console.error('FAIL: Allowed simulation to run a second time.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('SIMULATION_CANNOT_BE_RE_RUN_OR_CONSUMED')) {
        console.log('  PASS: Re-run attempt correctly blocked with SIMULATION_CANNOT_BE_RE_RUN_OR_CONSUMED.');
      } else {
        throw e;
      }
    }

    // Verify final state is still SIMULATED (not corrupted by re-run attempt)
    const finalSim = await builderSvc.getSimulation(simId);
    assert.strictEqual(finalSim.simulation_status, 'SIMULATED');
    console.log('  PASS: Simulation final status remains SIMULATED after re-run attempt.');

    console.log('\nSmoke 141G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 141G:', e);
    process.exit(1);
  }
})();
