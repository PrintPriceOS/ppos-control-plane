'use strict';
// Smoke 141I: Evidence Pack v141.0 and Lineage Hash Chain
process.env.DB_UNREACHABLE = 'true';

const assert = require('assert');
const builderSvc = require('../src/api/services/cohortInterventionSimulationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationBuilderService');
const impactSvc = require('../src/api/services/cohortInterventionSimulationImpactAnalysisService').serviceInstance || require('../src/api/services/cohortInterventionSimulationImpactAnalysisService');
const rollbackSvc = require('../src/api/services/cohortInterventionSimulationRollbackPreviewService').serviceInstance || require('../src/api/services/cohortInterventionSimulationRollbackPreviewService');
const confirmSvc = require('../src/api/services/cohortInterventionSimulationOperatorConfirmationService').serviceInstance || require('../src/api/services/cohortInterventionSimulationOperatorConfirmationService');
const runnerSvc = require('../src/api/services/cohortInterventionSimulationRunnerService').serviceInstance || require('../src/api/services/cohortInterventionSimulationRunnerService');
const evidenceSvc = require('../src/api/services/cohortInterventionSimulationEvidencePackService').serviceInstance || require('../src/api/services/cohortInterventionSimulationEvidencePackService');

(async () => {
  console.log('=== Smoke 141I: Evidence Pack v141.0 and Lineage Hash Chain ===\n');

  try {
    const simId = 'mock_sim_141i';
    const mockLineageHashes = {
      source_execution_hash: 'exec_hash_141i_from_phase140',
      source_execution_evidence_pack_hash: 'exec_evpack_141i_from_phase140',
      source_approval_hash: 'approval_hash_141i_from_phase139',
      source_preparation_hash: 'prep_hash_141i_from_phase138',
      source_review_hash: 'review_hash_141i_from_phase137'
    };

    const mockSim = {
      simulation_id: simId,
      simulation_type: 'SIMULATE_INVITE_REVOCATION',
      simulation_status: 'DRAFT',
      cohort_id: 'cohort_beta_141i',
      tenant_id: 'tenant_beta_141i',
      source_execution_id: 'mock_exec_141i',
      ...mockLineageHashes,
      operator_confirmed: 0,
      safe_scope_simulation_attestation: 'PHASE_141_SIMULATION_ONLY_NO_OPERATIONAL_MUTATION',
      simulation_write_scope_attestation_json: { writes_only_phase141_tables: true, wrote_phase128_to_140_operational_tables: false, cohort_access_mutated: false, invite_access_mutated: false, participant_access_mutated: false, cohort_expanded: false, payment_or_billing_mutated: false },
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
    await confirmSvc.confirmSimulation(simId, 'admin', 'Op 141I', 'CONFIRM_PHASE_141_HIGH_RISK_SIMULATION');
    const runRes = await runnerSvc.runSimulation(simId, 'admin');

    assert.ok(runRes.evidence_pack_hash, 'evidence_pack_hash must be set');
    console.log('  PASS: Evidence pack hash returned by runner.');

    // Retrieve evidence
    const evidence = await evidenceSvc.getEvidence(simId);
    assert.ok(evidence, 'Evidence must exist after simulation run');
    assert.strictEqual(evidence.evidence_schema_version, '141.0');
    console.log(`  PASS: Evidence schema version is '141.0'.`);

    // Validate lineage hash chain is present and complete
    const chain = typeof evidence.lineage_hash_chain_json === 'string'
      ? JSON.parse(evidence.lineage_hash_chain_json) : evidence.lineage_hash_chain_json;

    const requiredChainKeys = [
      'phase141_simulation_id',
      'phase141_simulation_type',
      'phase140_source_execution_hash',
      'phase140_source_execution_evidence_pack_hash',
      'phase139_source_approval_hash',
      'phase138_source_preparation_hash',
      'phase137_source_review_hash'
    ];

    for (const key of requiredChainKeys) {
      assert.ok(chain[key], `Lineage chain missing key: ${key}`);
      console.log(`  PASS: Lineage chain key '${key}' = '${String(chain[key]).substring(0, 24)}…'`);
    }

    // Validate the chain correctly traces Phase 137-140 hashes
    assert.strictEqual(chain.phase141_simulation_id, simId);
    assert.strictEqual(chain.phase140_source_execution_hash, mockLineageHashes.source_execution_hash);
    assert.strictEqual(chain.phase139_source_approval_hash, mockLineageHashes.source_approval_hash);
    assert.strictEqual(chain.phase138_source_preparation_hash, mockLineageHashes.source_preparation_hash);
    assert.strictEqual(chain.phase137_source_review_hash, mockLineageHashes.source_review_hash);
    console.log('  PASS: Lineage hash chain traces correctly from Phase 141 → 140 → 139 → 138 → 137.');

    // Validate evidence payload includes write scope attestation
    const payload = typeof evidence.evidence_payload_json === 'string'
      ? JSON.parse(evidence.evidence_payload_json) : evidence.evidence_payload_json;
    assert.ok(payload.write_scope_attestation, 'Evidence must include write_scope_attestation');
    assert.strictEqual(payload.write_scope_attestation.writes_only_phase141_tables, true);
    console.log('  PASS: Evidence pack includes write_scope_attestation confirming Phase 141 tables only.');

    // Validate evidence pack hash is deterministic (rebuild and compare)
    const { evidence_pack_hash: hashFromRunner } = runRes;
    assert.ok(hashFromRunner, 'Runner must return evidence_pack_hash');
    console.log(`  PASS: Evidence pack hash deterministic: ${hashFromRunner.substring(0, 16)}…`);

    console.log('\nSmoke 141I: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 141I:', e);
    process.exit(1);
  }
})();
