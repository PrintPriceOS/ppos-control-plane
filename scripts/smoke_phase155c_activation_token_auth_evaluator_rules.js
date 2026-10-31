'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const handoffBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationHandoffBuilderService').serviceInstance;
const tokenAuthBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenAuthBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenAuthEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupHandoffAndTokenAuth(activationHandoffId, activationTokenAuthId, status = 'FINALIZED', result = 'TOKEN_PREPARED_NOT_ISSUED', authConfig = {}) {
  const writeScope154 = { writes_only_phase154_tables: true, wrote_phase128_to_153_operational_tables: false };
  const writeScope155 = { writes_only_phase155_tables: true, wrote_phase128_to_154_operational_tables: false };
  const nonExecution154 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution155 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const defaultAuthConfig = {
    token_auth_mode: 'TOKEN_ISSUANCE_AUTHORIZATION_ONLY',
    token_authorization_status: 'AUTHORIZED_NOT_ISSUED',
    token_status: 'PREPARED_NOT_ISSUED',
    token_issuance_status: 'AUTHORIZED_NOT_ISSUED',
    token_redeemable: false,
    allow_token_issue: false,
    allow_token_redeem: false,
    allow_real_activation: false,
    allow_real_execution: false,
    allow_plan_executable_state: false,
    allow_job_creation: false,
    allow_queue_dispatch: false,
    allow_runtime_writes: false,
    max_runtime_mutations: 0,
    max_execution_jobs: 0,
    requires_future_token_issuance_envelope_gate: true,
    requires_kill_switch: true,
    requires_rollback_authority: true,
    requires_governance_signoff: true,
    requires_operator_confirmation: true,
    requires_handoff_hash_verification: true,
    immutable_after_finalization: true
  };
  const activeAuthConfig = { ...defaultAuthConfig, ...authConfig };

  const handoffRecord = {
    activation_handoff_id: activationHandoffId,
    source_activation_decision_id: 'dec_test_155c',
    source_activation_lock_id: 'lock_test_155c',
    source_activation_auth_id: 'auth_test_155c',
    source_activation_readiness_id: 'rd_test_155c',
    source_plan_id: 'pln_test_155c',
    source_dispatcher_id: 'dsp_test_155c',
    source_envelope_id: 'env_test_155c',
    source_auth_id: 'ath_test_155c',
    source_readiness_id: 'rd_test_155c',
    source_approval_id: 'apv_test_155c',
    source_prep_id: 'prep_test_155c',
    source_review_id: 'rev_test_155c',
    source_simulation_id: 'sim_test_155c',
    source_execution_id: 'exec_test_155c',
    cohort_id: 'cohort_test_155c',
    tenant_id: 'tenant_test_155c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_handoff_status: status,
    activation_handoff_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { handoff_mode: 'TOKEN_PREPARATION_ONLY', allow_real_activation: false },
    handoff_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    handoff_rules_json: {},
    handoff_blockers_json: {},
    non_execution_attestation_json: nonExecution154,
    write_scope_attestation_json: writeScope154,
    source_activation_decision_hash: 'decision_hash_155c',
    source_freeze_package_hash: 'lock_hash_155c',
    activation_handoff_hash: 'handoff_hash_155c',
    token_material_hash: 'token_material_hash_155c',
    evidence_pack_hash: 'pack_hash_155c',
    lineage_hash_chain_json: {},
    handoff_rationale_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'HANDOFF_FINALIZED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE',
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

  const tokenAuthRecord = {
    activation_token_auth_id: activationTokenAuthId,
    source_activation_handoff_id: activationHandoffId,
    source_activation_decision_id: 'dec_test_155c',
    source_activation_lock_id: 'lock_test_155c',
    source_activation_auth_id: 'auth_test_155c',
    source_activation_readiness_id: 'rd_test_155c',
    source_plan_id: 'pln_test_155c',
    source_dispatcher_id: 'dsp_test_155c',
    source_envelope_id: 'env_test_155c',
    source_auth_id: 'ath_test_155c',
    source_readiness_id: 'rd_test_155c',
    source_approval_id: 'apv_test_155c',
    source_prep_id: 'prep_test_155c',
    source_review_id: 'rev_test_155c',
    source_simulation_id: 'sim_test_155c',
    source_execution_id: 'exec_test_155c',
    cohort_id: 'cohort_test_155c',
    tenant_id: 'tenant_test_155c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_auth_status: 'DRAFT',
    activation_token_auth_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: activeAuthConfig,
    token_auth_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_auth_rules_json: {},
    token_auth_blockers_json: { missing_token_auth_evaluation: true },
    non_execution_attestation_json: nonExecution155,
    write_scope_attestation_json: writeScope155,
    source_activation_handoff_hash: 'handoff_hash_155c',
    source_token_material_hash: 'token_material_hash_155c',
    source_freeze_package_hash: 'lock_hash_155c',
    activation_token_auth_hash: null,
    token_auth_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    authorization_rationale_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_AUTH_FINALIZED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE',
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
    handoffBuilder._mockState.handoff.set(activationHandoffId, handoffRecord);
    tokenAuthBuilder._mockState.tokenAuth.set(activationTokenAuthId, tokenAuthRecord);
    tokenAuthBuilder._mockState.rules.set(activationTokenAuthId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_handoff_rules WHERE activation_handoff_id = ?', [activationHandoffId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_handoff_evidence WHERE activation_handoff_id = ?', [activationHandoffId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_handoff WHERE activation_handoff_id = ?', [activationHandoffId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_auth_rules WHERE activation_token_auth_id = ?', [activationTokenAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_auth_evidence WHERE activation_token_auth_id = ?', [activationTokenAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_auth WHERE activation_token_auth_id = ?', [activationTokenAuthId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_handoff
       (activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_handoff_status, activation_handoff_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, handoff_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        handoff_rules_json, handoff_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_decision_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_handoff_hash, token_material_hash, evidence_pack_hash)
       VALUES (?, 'dec_test_155c', 'lock_test_155c', 'auth_test_155c', 'rd_test_155c', 'pln_test_155c', 'dsp_test_155c', 'env_test_155c', 'ath_test_155c', 'rd_test_155c', 'apv_test_155c', 'prep_test_155c', 'rev_test_155c', 'sim_test_155c', 'exec_test_155c', 'cohort_test_155c', 'tenant_test_155c', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'TOKEN_PREPARED_NOT_ISSUED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"handoff_mode":"TOKEN_PREPARATION_ONLY", "allow_real_activation":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'decision_hash_155c', 'lock_hash_155c', 'EXECUTION_NOT_ENABLED', 'HANDOFF_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'handoff_hash_155c', 'token_material_hash_155c', 'pack_hash_155c')`,
      [activationHandoffId, JSON.stringify(nonExecution154), JSON.stringify(writeScope154)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_auth
       (activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_auth_status, activation_token_auth_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_auth_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_auth_rules_json, token_auth_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_handoff_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'dec_test_155c', 'lock_test_155c', 'auth_test_155c', 'rd_test_155c', 'pln_test_155c', 'dsp_test_155c', 'env_test_155c', 'ath_test_155c', 'rd_test_155c', 'apv_test_155c', 'prep_test_155c', 'rev_test_155c', 'sim_test_155c', 'exec_test_155c', 'cohort_test_155c', 'tenant_test_155c', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_token_auth_evaluation":true}', ?, ?, 'handoff_hash_155c', 'token_material_hash_155c', 'lock_hash_155c', 'EXECUTION_NOT_ENABLED', 'TOKEN_AUTH_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        activationTokenAuthId,
        activationHandoffId,
        JSON.stringify(activeAuthConfig),
        JSON.stringify(nonExecution155),
        JSON.stringify(writeScope155)
      ]
    );
  }
}

(async () => {
  console.log('=== Smoke 155C: Activation Token Auth Evaluator Rules ===\n');

  try {
    // 1. Positive: evaluate ready record with all metrics passing
    const h1 = 'ahf_155c_1';
    const t1 = 'ata_155c_1';
    await setupHandoffAndTokenAuth(h1, t1, 'FINALIZED', 'TOKEN_PREPARED_NOT_ISSUED');
    
    const passed = await evaluator.evaluateTokenAuth(t1, {
      operator_confirmed: true,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    assert.strictEqual(passed.success, true);
    let record = await tokenAuthBuilder.getTokenAuth(t1);
    assert.strictEqual(record.activation_token_auth_status, 'EVALUATED');
    assert.strictEqual(record.activation_token_auth_result, 'AUTHORIZED_NOT_ISSUED');
    console.log('  PASS: Evaluated token auth record successfully.');

    // 2. Negative: fail check if operator is missing
    const h2 = 'ahf_155c_2';
    const t2 = 'ata_155c_2';
    await setupHandoffAndTokenAuth(h2, t2, 'FINALIZED', 'TOKEN_PREPARED_NOT_ISSUED');
    
    const passedFail = await evaluator.evaluateTokenAuth(t2, {
      operator_confirmed: false,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    assert.strictEqual(passedFail.success, false);
    record = await tokenAuthBuilder.getTokenAuth(t2);
    assert.strictEqual(record.activation_token_auth_status, 'BLOCKED');
    assert.strictEqual(record.activation_token_auth_result, 'AUTHORIZATION_BLOCKED_BY_GUARDRAIL');
    console.log('  PASS: Correctly failed evaluation when operator confirmation is missing.');

    console.log('\nSmoke 155C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 155C:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
