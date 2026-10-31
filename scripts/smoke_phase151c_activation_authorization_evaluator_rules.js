'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const rdBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationReadinessBuilderService').serviceInstance;
const authBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationAuthorizationBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationAuthorizationEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupReadinessAndAuth(activationRdId, activationAuthId, status = 'FINALIZED', result = 'ACTIVATION_READY_NOT_ACTIVE', authConfig = {}) {
  const writeScope150 = { writes_only_phase150_tables: true, wrote_phase128_to_149_operational_tables: false };
  const writeScope151 = { writes_only_phase151_tables: true, wrote_phase128_to_150_operational_tables: false };
  const nonExecution150 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution151 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const defaultAuthConfig = {
    authorization_mode: 'ACTIVATION_AUTHORIZATION_ONLY',
    activation_authorization_status: 'AUTHORIZED_NOT_ACTIVE',
    allow_real_activation: false,
    allow_real_execution: false,
    allow_plan_executable_state: false,
    allow_job_creation: false,
    allow_queue_dispatch: false,
    allow_runtime_writes: false,
    max_runtime_mutations: 0,
    max_execution_jobs: 0,
    requires_future_activation_lock_gate: true,
    requires_kill_switch: true,
    requires_rollback_authority: true,
    requires_operator_confirmation: true,
    requires_governance_signature: true,
    requires_parent_readiness_hash_verification: true
  };
  const activeAuthConfig = { ...defaultAuthConfig, ...authConfig };

  const rdRecord = {
    activation_rd_id: activationRdId,
    source_plan_id: 'pln_test_151c',
    source_dispatcher_id: 'dsp_test_151c',
    source_envelope_id: 'env_test_151c',
    source_auth_id: 'ath_test_151c',
    source_readiness_id: 'rd_test_151c',
    source_approval_id: 'apv_test_151c',
    source_prep_id: 'prep_test_151c',
    source_review_id: 'rev_test_151c',
    source_simulation_id: 'sim_test_151c',
    source_execution_id: 'exec_test_151c',
    cohort_id: 'cohort_test_151c',
    tenant_id: 'tenant_test_151c',
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
    source_plan_hash: 'plan_hash_151c',
    source_plan_evidence_pack_hash: 'pe_hash_151c',
    activation_readiness_hash: 'rd_hash_151c',
    evidence_pack_hash: 'pack_hash_151c',
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

  const authRecord = {
    activation_auth_id: activationAuthId,
    source_activation_readiness_id: activationRdId,
    source_plan_id: 'pln_test_151c',
    source_dispatcher_id: 'dsp_test_151c',
    source_envelope_id: 'env_test_151c',
    source_auth_id: 'ath_test_151c',
    source_readiness_id: 'rd_test_151c',
    source_approval_id: 'apv_test_151c',
    source_prep_id: 'prep_test_151c',
    source_review_id: 'rev_test_151c',
    source_simulation_id: 'sim_test_151c',
    source_execution_id: 'exec_test_151c',
    cohort_id: 'cohort_test_151c',
    tenant_id: 'tenant_test_151c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_auth_status: 'DRAFT',
    activation_auth_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: activeAuthConfig,
    auth_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    auth_rules_json: {},
    auth_blockers_json: { missing_authorization_evaluation: true },
    non_execution_attestation_json: nonExecution151,
    write_scope_attestation_json: writeScope151,
    source_activation_readiness_hash: 'rd_hash_151c',
    activation_authorization_hash: null,
    authorization_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'AUTHORIZATION_FINALIZED_NOT_EXECUTED',
    plan_executable_status: 'NOT_EXECUTABLE',
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
    authBuilder._mockState.authorization.set(activationAuthId, authRecord);
    authBuilder._mockState.rules.set(activationAuthId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_rd_rules WHERE activation_rd_id = ?', [activationRdId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_rd_evidence WHERE activation_rd_id = ?', [activationRdId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_rd WHERE activation_rd_id = ?', [activationRdId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_auth_rules WHERE activation_auth_id = ?', [activationAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_auth_evidence WHERE activation_auth_id = ?', [activationAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_auth WHERE activation_auth_id = ?', [activationAuthId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_rd
       (activation_rd_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_readiness_status, activation_readiness_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, readiness_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        readiness_rules_json, readiness_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_plan_hash, source_plan_evidence_pack_hash,
        execution_capability_status, activation_execution_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_readiness_hash, evidence_pack_hash)
       VALUES (?, 'pln_test_151c', 'dsp_test_151c', 'env_test_151c', 'ath_test_151c', 'rd_test_151c', 'apv_test_151c', 'prep_test_151c', 'rev_test_151c', 'sim_test_151c', 'exec_test_151c', 'cohort_test_151c', 'tenant_test_151c', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"activation_mode":"READINESS_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'plan_hash_151c', 'pe_hash_151c', 'EXECUTION_NOT_ENABLED', 'ACTIVATION_NOT_EXECUTED', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'rd_hash_151c', 'pack_hash_151b')`,
      [activationRdId, status, result, JSON.stringify(nonExecution150), JSON.stringify(writeScope150)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_auth
       (activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_auth_status, activation_auth_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, auth_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        auth_rules_json, auth_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_readiness_hash,
        execution_capability_status, activation_execution_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'pln_test_151c', 'dsp_test_151c', 'env_test_151c', 'ath_test_151c', 'rd_test_151c', 'apv_test_151c', 'prep_test_151c', 'rev_test_151c', 'sim_test_151c', 'exec_test_151c', 'cohort_test_151c', 'tenant_test_151c', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_authorization_evaluation":true}', ?, ?, 'rd_hash_151c', 'EXECUTION_NOT_ENABLED', 'AUTHORIZATION_FINALIZED_NOT_EXECUTED', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [activationAuthId, activationRdId, JSON.stringify(activeAuthConfig), JSON.stringify(nonExecution151), JSON.stringify(writeScope151)]
    );
  }
}

(async () => {
  console.log('=== Smoke 151C: Activation Authorization Evaluator Rules ===\n');

  try {
    // 1. Positive: evaluate ready record with all metrics passing
    const a1 = 'rd_151c_1';
    const e1 = 'ard_151c_1';
    await setupReadinessAndAuth(a1, e1, 'FINALIZED', 'ACTIVATION_READY_NOT_ACTIVE');
    
    const passed = await evaluator.evaluateAuthorization(e1, {
      operator_confirmed: true,
      kill_switch_verified: true,
      rollback_authority_verified: true,
      governance_signer_present: true
    }, 'admin');

    assert.strictEqual(passed.success, true);
    let record = await authBuilder.getAuthorization(e1);
    assert.strictEqual(record.activation_auth_status, 'EVALUATED');
    assert.strictEqual(record.activation_auth_result, 'AUTHORIZED_NOT_ACTIVE');
    console.log('  PASS: Evaluated authorization record successfully.');

    // 2. Negative: fail check if operator is missing
    const a2 = 'rd_151c_2';
    const e2 = 'ard_151c_2';
    await setupReadinessAndAuth(a2, e2, 'FINALIZED', 'ACTIVATION_READY_NOT_ACTIVE');
    
    const passedFail = await evaluator.evaluateAuthorization(e2, {
      operator_confirmed: false,
      kill_switch_verified: true,
      rollback_authority_verified: true,
      governance_signer_present: true
    }, 'admin');

    assert.strictEqual(passedFail.success, false);
    record = await authBuilder.getAuthorization(e2);
    assert.strictEqual(record.activation_auth_status, 'BLOCKED');
    assert.strictEqual(record.activation_auth_result, 'AUTHORIZATION_BLOCKED_BY_GUARDRAIL');
    console.log('  PASS: Correctly failed evaluation when operator confirmation is missing.');

    console.log('\nSmoke 151C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 151C:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
