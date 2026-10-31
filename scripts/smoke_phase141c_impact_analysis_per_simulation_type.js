'use strict';
// Smoke 141C: Impact Analysis per high-risk simulation type
// Validates each of the 4 simulation types generates correct impact_projection_json
// UNIT SMOKE: forces mock mode — validates service logic, not DB schema.
// DB schema validation is covered by smoke 141A.
process.env.DB_UNREACHABLE = 'true'; // Force mock mode — inject _mockState, no real DB needed

const assert = require('assert');
const impactSvc = require('../src/api/services/cohortInterventionSimulationImpactAnalysisService').serviceInstance || require('../src/api/services/cohortInterventionSimulationImpactAnalysisService');
const builderSvc = require('../src/api/services/cohortInterventionSimulationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationBuilderService');

const SIMULATION_TYPES = [
  'SIMULATE_COHORT_PAUSE',
  'SIMULATE_PARTICIPANT_ACCESS_RESTRICTION',
  'SIMULATE_INVITE_REVOCATION',
  'SIMULATE_CONTROLLED_EXPANSION'
];

(async () => {
  console.log('=== Smoke 141C: Impact Analysis per High-Risk Simulation Type ===\n');

  try {
    for (const simType of SIMULATION_TYPES) {
      // Inject a mock simulation record
      const simId = `mock_sim_141c_${simType.toLowerCase().replace(/_/g, '_')}`;
      const mockSim = {
        simulation_id: simId,
        simulation_type: simType,
        simulation_status: 'DRAFT',
        cohort_id: 'cohort_beta_141c',
        tenant_id: 'tenant_beta_141c',
        source_execution_id: 'mock_exec_141c',
        simulation_write_scope_attestation_json: { writes_only_phase141_tables: true, wrote_phase128_to_140_operational_tables: false },
        simulation_blockers_json: { missing_impact_analysis: true, missing_rollback_preview: true, missing_operator_confirmation: true }
      };
      builderSvc._mockState.simulations.set(simId, mockSim);
      builderSvc._mockState.steps.set(simId, [
        { step_id: 's1', simulation_id: simId, step_key: 'impact_analysis', status: 'PENDING', required: 1 },
        { step_id: 's2', simulation_id: simId, step_key: 'rollback_preview', status: 'PENDING', required: 1 },
        { step_id: 's3', simulation_id: simId, step_key: 'operator_confirmation', status: 'PENDING', required: 1 }
      ]);

      const result = await impactSvc.generateImpactAnalysis(simId, 'admin');

      assert.ok(result.impact_projection_hash, `impact_projection_hash must exist for ${simType}`);
      assert.ok(result.impact_projection, `impact_projection must exist for ${simType}`);
      assert.strictEqual(result.impact_projection.simulation_type, simType);
      assert.ok(result.impact_projection.projected_effects, `projected_effects must exist for ${simType}`);

      // Validate no operational tables are mutated
      const projection = result.impact_projection;
      assert.deepStrictEqual(projection.operational_tables_mutated, [], `No operational tables must be mutated for ${simType}`);
      assert.ok(projection.simulation_tables_written.every(t => t.startsWith('controlled_beta_cohort_intervention_sim')),
        `Only Phase 141 simulation tables must be written for ${simType}`);

      // Validate step was marked complete
      const steps = builderSvc._mockState.steps.get(simId);
      const stepDone = steps.find(s => s.step_key === 'impact_analysis');
      assert.strictEqual(stepDone?.status, 'COMPLETED', `impact_analysis step must be COMPLETED for ${simType}`);

      console.log(`  PASS: ${simType} — impact analysis generated correctly. Operational tables mutated: 0`);
    }

    console.log('\nSmoke 141C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 141C:', e);
    process.exit(1);
  }
})();
