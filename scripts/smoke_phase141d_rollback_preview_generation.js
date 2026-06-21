'use strict';
// Smoke 141D: Rollback Preview Generation

const assert = require('assert');
const rollbackSvc = require('../src/api/services/cohortInterventionSimulationRollbackPreviewService').serviceInstance || require('../src/api/services/cohortInterventionSimulationRollbackPreviewService');
const impactSvc = require('../src/api/services/cohortInterventionSimulationImpactAnalysisService').serviceInstance || require('../src/api/services/cohortInterventionSimulationImpactAnalysisService');
const builderSvc = require('../src/api/services/cohortInterventionSimulationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationBuilderService');

const SIMULATION_TYPES = [
  'SIMULATE_COHORT_PAUSE',
  'SIMULATE_PARTICIPANT_ACCESS_RESTRICTION',
  'SIMULATE_INVITE_REVOCATION',
  'SIMULATE_CONTROLLED_EXPANSION'
];

(async () => {
  console.log('=== Smoke 141D: Rollback Preview Generation ===\n');

  try {
    for (const simType of SIMULATION_TYPES) {
      const simId = `mock_sim_141d_${simType.toLowerCase()}`;
      const mockSim = {
        simulation_id: simId,
        simulation_type: simType,
        simulation_status: 'DRAFT',
        cohort_id: 'cohort_beta_141d',
        tenant_id: 'tenant_beta_141d',
        simulation_write_scope_attestation_json: { writes_only_phase141_tables: true, wrote_phase128_to_140_operational_tables: false },
        simulation_blockers_json: { missing_impact_analysis: true, missing_rollback_preview: true, missing_operator_confirmation: true }
      };
      builderSvc._mockState.simulations.set(simId, mockSim);
      builderSvc._mockState.steps.set(simId, [
        { step_id: 's1', simulation_id: simId, step_key: 'impact_analysis', status: 'PENDING', required: 1 },
        { step_id: 's2', simulation_id: simId, step_key: 'rollback_preview', status: 'PENDING', required: 1 },
        { step_id: 's3', simulation_id: simId, step_key: 'operator_confirmation', status: 'PENDING', required: 1 }
      ]);

      // Must generate impact analysis first
      await impactSvc.generateImpactAnalysis(simId, 'admin');

      // Now rollback preview
      const result = await rollbackSvc.generateRollbackPreview(simId, 'admin');

      assert.ok(result.rollback_preview_hash, `rollback_preview_hash must exist for ${simType}`);
      assert.ok(result.rollback_preview, `rollback_preview must exist for ${simType}`);
      assert.ok(result.rollback_preview.rollback_strategy, `rollback_strategy must exist for ${simType}`);
      assert.ok(Array.isArray(result.rollback_preview.rollback_steps) && result.rollback_preview.rollback_steps.length > 0,
        `rollback_steps must be non-empty for ${simType}`);

      // No operational mutations in rollback preview
      assert.deepStrictEqual(result.rollback_preview.operational_tables_mutated, [], `No operational tables mutated in rollback preview for ${simType}`);

      // Step marked complete
      const steps = builderSvc._mockState.steps.get(simId);
      const step = steps.find(s => s.step_key === 'rollback_preview');
      assert.strictEqual(step?.status, 'COMPLETED', `rollback_preview step must be COMPLETED for ${simType}`);

      // Cannot generate rollback preview without impact analysis
      const simId2 = `mock_sim_141d_noimpact_${simType.toLowerCase()}`;
      builderSvc._mockState.simulations.set(simId2, { ...mockSim, simulation_id: simId2 });
      builderSvc._mockState.steps.set(simId2, [
        { step_id: 'x1', simulation_id: simId2, step_key: 'impact_analysis', status: 'PENDING', required: 1 }
      ]);
      try {
        await rollbackSvc.generateRollbackPreview(simId2, 'admin');
        console.error(`FAIL: Should require impact analysis before rollback preview for ${simType}`);
        process.exit(1);
      } catch (e) {
        if (!e.message.includes('IMPACT_ANALYSIS_REQUIRED')) throw e;
      }

      console.log(`  PASS: ${simType} — rollback preview generated correctly. Strategy: ${result.rollback_preview.rollback_strategy}`);
    }

    console.log('\nSmoke 141D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 141D:', e);
    process.exit(1);
  }
})();
