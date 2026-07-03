'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const simBuilder = require('../src/api/services/cohortInterventionSimulationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationBuilderService');
const simEvidence = require('../src/api/services/cohortInterventionSimulationEvidencePackService').serviceInstance || require('../src/api/services/cohortInterventionSimulationEvidencePackService');
const reviewBuilder = require('../src/api/services/cohortInterventionSimulationReviewBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationReviewBuilderService');

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupSimulationFixture(status = 'SIMULATED', writeScopeClean = true) {
  if (isProdLike) {
    // In real DB: find or insert a temporary simulation
    const simId = 'sim_tmp_142b_' + Math.random().toString(36).substring(7);
    const execId = 'exec_tmp_142b';
    
    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_simulations
       (simulation_id, source_execution_id, source_execution_type, source_execution_hash,
        source_execution_evidence_pack_hash, source_approval_hash, source_preparation_hash,
        source_review_hash, tenant_id, cohort_id, simulation_type, simulation_status,
        operator_confirmed, safe_scope_simulation_attestation, simulation_write_scope_attestation_json,
        simulation_blockers_json, requested_by)
       VALUES (?, ?, 'EXECUTE_RISK_ESCALATION_MARKER', 'exec_hash', 'exec_ev_hash', 'app_hash', 'prep_hash', 'rev_hash', 'tenant_142b', 'cohort_142b', 'SIMULATE_COHORT_PAUSE', ?, 1, 'PHASE_141_SIMULATION_ONLY_NO_OPERATIONAL_MUTATION', ?, '{}', 'admin')`,
      [
        simId, execId, status,
        JSON.stringify({
          writes_only_phase141_tables: writeScopeClean,
          wrote_phase128_to_140_operational_tables: !writeScopeClean
        })
      ]
    );

    // Build evidence pack v141.0
    const lineage = {
      phase141_simulation_id: simId,
      phase141_simulation_type: 'SIMULATE_COHORT_PAUSE',
      phase140_source_execution_hash: 'exec_hash',
      phase140_source_execution_evidence_pack_hash: 'exec_ev_hash',
      phase139_source_approval_hash: 'app_hash',
      phase138_source_preparation_hash: 'prep_hash',
      phase137_source_review_hash: 'rev_hash'
    };
    const payload = {
      evidence_schema_version: '141.0',
      simulation_id: simId,
      simulation_status: status,
      write_scope_attestation: {
        writes_only_phase141_tables: writeScopeClean,
        wrote_phase128_to_140_operational_tables: !writeScopeClean
      },
      lineage_hash_chain: lineage
    };
    const packHash = 'pack_hash_' + simId;
    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_simulation_evidence
       (evidence_id, simulation_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '141.0', ?, ?, ?)`,
      ['sev_' + simId, simId, packHash, JSON.stringify(payload), JSON.stringify(lineage)]
    );

    return simId;
  } else {
    // Mock mode
    const simId = 'sim_mock_142b_' + status;
    const execId = 'exec_mock_142b';
    
    const record = {
      simulation_id: simId,
      source_execution_id: execId,
      source_execution_type: 'EXECUTE_RISK_ESCALATION_MARKER',
      source_execution_hash: 'exec_hash',
      source_execution_evidence_pack_hash: 'exec_ev_hash',
      source_approval_hash: 'app_hash',
      source_preparation_hash: 'prep_hash',
      source_review_hash: 'rev_hash',
      tenant_id: 'tenant_142b',
      cohort_id: 'cohort_142b',
      simulation_type: 'SIMULATE_COHORT_PAUSE',
      simulation_status: status,
      operator_confirmed: 1,
      safe_scope_simulation_attestation: 'PHASE_141_SIMULATION_ONLY_NO_OPERATIONAL_MUTATION',
      simulation_write_scope_attestation_json: {
        writes_only_phase141_tables: writeScopeClean,
        wrote_phase128_to_140_operational_tables: !writeScopeClean
      },
      simulation_blockers_json: {},
      requested_by: 'admin',
      created_at: new Date()
    };
    simBuilder._mockState.simulations.set(simId, record);

    const lineage = {
      phase141_simulation_id: simId,
      phase141_simulation_type: 'SIMULATE_COHORT_PAUSE',
      phase140_source_execution_hash: 'exec_hash',
      phase140_source_execution_evidence_pack_hash: 'exec_ev_hash',
      phase139_source_approval_hash: 'app_hash',
      phase138_source_preparation_hash: 'prep_hash',
      phase137_source_review_hash: 'rev_hash'
    };
    const payload = {
      evidence_schema_version: '141.0',
      simulation_id: simId,
      simulation_status: status,
      write_scope_attestation: {
        writes_only_phase141_tables: writeScopeClean,
        wrote_phase128_to_140_operational_tables: !writeScopeClean
      },
      lineage_hash_chain: lineage
    };

    simEvidence._mockState.evidence.set(simId, {
      evidence_id: 'sev_' + simId,
      simulation_id: simId,
      evidence_schema_version: '141.0',
      evidence_pack_hash: 'pack_hash_' + simId,
      evidence_payload_json: payload,
      lineage_hash_chain_json: lineage,
      created_at: new Date()
    });

    return simId;
  }
}

(async () => {
  console.log('=== Smoke 142B: Create Review from Phase 141 Simulation ===\n');

  try {
    // 1. Positive test: creation succeeds from SIMULATED simulation
    const simulatedId = await setupSimulationFixture('SIMULATED', true);
    const { review } = await reviewBuilder.createReview(simulatedId, 'admin');
    assert.ok(review.review_id, 'review_id must exist');
    assert.strictEqual(review.source_simulation_id, simulatedId);
    assert.strictEqual(review.review_status, 'DRAFT');
    console.log('  PASS: Review created successfully from SIMULATED simulation.');

    // 2. Negative test: creation fails from DRAFT simulation
    const draftId = await setupSimulationFixture('DRAFT', true);
    try {
      await reviewBuilder.createReview(draftId, 'admin');
      assert.fail('Should have failed creating review from DRAFT simulation');
    } catch (e) {
      if (e.message.includes('PHASE141_SIMULATION_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked review creation from DRAFT simulation.');
      } else {
        throw e;
      }
    }

    // 3. Negative test: creation fails from dirty write-scope
    const dirtyScopeId = await setupSimulationFixture('SIMULATED', false);
    try {
      await reviewBuilder.createReview(dirtyScopeId, 'admin');
      assert.fail('Should have failed creating review from simulation with dirty write scope');
    } catch (e) {
      if (e.message.includes('PHASE141_WRITE_SCOPE_ATTESTATION_FAILED')) {
        console.log('  PASS: Correctly blocked review creation from dirty write-scope.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 142B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 142B:', e);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
