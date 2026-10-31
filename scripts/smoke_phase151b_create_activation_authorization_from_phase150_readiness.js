'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const rdBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationReadinessBuilderService').serviceInstance;
const authBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationAuthorizationBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupReadinessFixture(activationRdId, status = 'FINALIZED', result = 'ACTIVATION_READY_NOT_ACTIVE') {
  const writeScope150 = { writes_only_phase150_tables: true, wrote_phase128_to_149_operational_tables: false };
  const nonExecution150 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const rdRecord = {
    activation_rd_id: activationRdId,
    source_plan_id: 'pln_test_151b',
    source_dispatcher_id: 'dsp_test_151b',
    source_envelope_id: 'env_test_151b',
    source_auth_id: 'ath_test_151b',
    source_readiness_id: 'rd_test_151b',
    source_approval_id: 'apv_test_151b',
    source_prep_id: 'prep_test_151b',
    source_review_id: 'rev_test_151b',
    source_simulation_id: 'sim_test_151b',
    source_execution_id: 'exec_test_151b',
    cohort_id: 'cohort_test_151b',
    tenant_id: 'tenant_test_151b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_readiness_status: status,
    activation_readiness_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { activation_mode: 'READINESS_ONLY', allow_real_activation: false },
    readiness_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    readiness_rules_json: {},
    readiness_blockers_json: {},
    non_execution_attestation_json: nonExecution150,
    write_scope_attestation_json: writeScope150,
    source_plan_hash: 'plan_hash_151b',
    source_plan_evidence_pack_hash: 'pe_hash_151b',
    activation_readiness_hash: 'rd_hash_151b',
    evidence_pack_hash: 'pack_hash_151b',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'ACTIVATION_NOT_EXECUTED',
    job_creation_status: 'NO_REAL_JOB_CREATED',
    queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    finalized_by: null,
    finalized_at: null,
    created_at: new Date(),
    updated_at: new Date()
  };

  if (!isProdLike) {
    rdBuilder._mockState.readiness.set(activationRdId, rdRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_rd_rules WHERE activation_rd_id = ?', [activationRdId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_rd_evidence WHERE activation_rd_id = ?', [activationRdId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_rd WHERE activation_rd_id = ?', [activationRdId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_rd
       (activation_rd_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_readiness_status, activation_readiness_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, readiness_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        readiness_rules_json, readiness_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_plan_hash, source_plan_evidence_pack_hash,
        execution_capability_status, activation_execution_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_readiness_hash, evidence_pack_hash)
       VALUES (?, 'pln_test_151b', 'dsp_test_151b', 'env_test_151b', 'ath_test_151b', 'rd_test_151b', 'apv_test_151b', 'prep_test_151b', 'rev_test_151b', 'sim_test_151b', 'exec_test_151b', 'cohort_test_151b', 'tenant_test_151b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"activation_mode":"READINESS_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'plan_hash_151b', 'pe_hash_151b', 'EXECUTION_NOT_ENABLED', 'ACTIVATION_NOT_EXECUTED', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'rd_hash_151b', 'pack_hash_151b')`,
      [activationRdId, status, result, JSON.stringify(nonExecution150), JSON.stringify(writeScope150)]
    );
  }
}

(async () => {
  console.log('=== Smoke 151B: Create Activation Authorization from Phase 150 Readiness ===\n');

  try {
    // 1. Positive: create from finalized approved readiness record
    const finalizedId = 'rd_finalized_151b';
    await setupReadinessFixture(finalizedId, 'FINALIZED', 'ACTIVATION_READY_NOT_ACTIVE');
    
    const { authorization } = await authBuilder.createAuthorization(finalizedId, 'admin');
    assert.ok(authorization.activation_auth_id, 'activation_auth_id should exist');
    assert.strictEqual(authorization.source_activation_readiness_id, finalizedId);
    assert.strictEqual(authorization.activation_auth_status, 'DRAFT');
    console.log('  PASS: Draft authorization created successfully from finalized and approved readiness.');

    // 2. Negative: block from DRAFT readiness
    const draftId = 'rd_draft_151b';
    await setupReadinessFixture(draftId, 'DRAFT', 'ACTIVATION_READY_NOT_ACTIVE');
    try {
      await authBuilder.createAuthorization(draftId, 'admin');
      assert.fail('Should have failed creating authorization from DRAFT readiness');
    } catch (e) {
      if (e.message.includes('PHASE150_READINESS_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked authorization draft creation from non-finalized readiness.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 151B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 151B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
