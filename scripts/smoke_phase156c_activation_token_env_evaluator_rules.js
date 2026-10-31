'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const tokenAuthBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenAuthBuilderService').serviceInstance;
const tokenEnvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenEnvBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenEnvEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupTokenAuthAndTokenEnv(activationTokenAuthId, activationTokenEnvId, status = 'FINALIZED', result = 'AUTHORIZED_NOT_ISSUED', envConfig = {}) {
  const writeScope155 = { writes_only_phase155_tables: true, wrote_phase128_to_154_operational_tables: false };
  const writeScope156 = { writes_only_phase156_tables: true, wrote_phase128_to_155_operational_tables: false };
  const nonExecution155 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution156 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const defaultEnvConfig = {
    token_envelope_mode: 'ISSUANCE_ENVELOPE_PREPARATION_ONLY',
    token_env_status: 'ENVELOPE_PREPARED_NOT_ISSUED',
    token_status: 'PREPARED_NOT_ISSUED',
    token_issuance_status: 'ENVELOPE_PREPARED_NOT_ISSUED',
    token_redeemable: false,
    envelope_redeemable: false,
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
    requires_future_token_issuance_final_approval_gate: true,
    requires_security_officer_confirmation: true,
    requires_kill_switch: true,
    requires_rollback_authority: true,
    requires_token_auth_hash_verification: true,
    immutable_after_finalization: true
  };
  const activeEnvConfig = { ...defaultEnvConfig, ...envConfig };

  const tokenAuthRecord = {
    activation_token_auth_id: activationTokenAuthId,
    source_activation_handoff_id: 'ahf_test_156c',
    source_activation_decision_id: 'dec_test_156c',
    source_activation_lock_id: 'lock_test_156c',
    source_activation_auth_id: 'auth_test_156c',
    source_activation_readiness_id: 'rd_test_156c',
    source_plan_id: 'pln_test_156c',
    source_dispatcher_id: 'dsp_test_156c',
    source_envelope_id: 'env_test_156c',
    source_auth_id: 'ath_test_156c',
    source_readiness_id: 'rd_test_156c',
    source_approval_id: 'apv_test_156c',
    source_prep_id: 'prep_test_156c',
    source_review_id: 'rev_test_156c',
    source_simulation_id: 'sim_test_156c',
    source_execution_id: 'exec_test_156c',
    cohort_id: 'cohort_test_156c',
    tenant_id: 'tenant_test_156c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_auth_status: status,
    activation_token_auth_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { token_auth_mode: 'TOKEN_ISSUANCE_AUTHORIZATION_ONLY', allow_token_issue: false, token_status: 'PREPARED_NOT_ISSUED', token_issuance_status: 'AUTHORIZED_NOT_ISSUED', token_redeemable: false },
    token_auth_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_auth_rules_json: {},
    token_auth_blockers_json: {},
    non_execution_attestation_json: nonExecution155,
    write_scope_attestation_json: writeScope155,
    source_activation_handoff_hash: 'handoff_hash_156c',
    source_token_material_hash: 'token_material_hash_156c',
    source_freeze_package_hash: 'lock_hash_156c',
    activation_token_auth_hash: 'token_auth_hash_156c',
    token_auth_evidence_pack_hash: 'pack_hash_156c',
    evidence_pack_hash: 'pack_hash_156c',
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

  const tokenEnvRecord = {
    activation_token_env_id: activationTokenEnvId,
    source_activation_token_auth_id: activationTokenAuthId,
    source_activation_handoff_id: 'ahf_test_156c',
    source_activation_decision_id: 'dec_test_156c',
    source_activation_lock_id: 'lock_test_156c',
    source_activation_auth_id: 'auth_test_156c',
    source_activation_readiness_id: 'rd_test_156c',
    source_plan_id: 'pln_test_156c',
    source_dispatcher_id: 'dsp_test_156c',
    source_envelope_id: 'env_test_156c',
    source_auth_id: 'ath_test_156c',
    source_readiness_id: 'rd_test_156c',
    source_approval_id: 'apv_test_156c',
    source_prep_id: 'prep_test_156c',
    source_review_id: 'rev_test_156c',
    source_simulation_id: 'sim_test_156c',
    source_execution_id: 'exec_test_156c',
    cohort_id: 'cohort_test_156c',
    tenant_id: 'tenant_test_156c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_env_status: 'DRAFT',
    activation_token_env_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: activeEnvConfig,
    token_env_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_env_rules_json: {},
    token_env_blockers_json: { missing_token_env_evaluation: true },
    non_execution_attestation_json: nonExecution156,
    write_scope_attestation_json: writeScope156,
    source_activation_token_auth_hash: 'token_auth_hash_156c',
    source_token_material_hash: 'token_material_hash_156c',
    source_freeze_package_hash: 'lock_hash_156c',
    activation_token_env_hash: null,
    token_env_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    security_signature_json: {},
    envelope_rationale_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_ENV_FINALIZED_NOT_EXECUTED',
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
    tokenAuthBuilder._mockState.tokenAuth.set(activationTokenAuthId, tokenAuthRecord);
    tokenEnvBuilder._mockState.tokenEnv.set(activationTokenEnvId, tokenEnvRecord);
    tokenEnvBuilder._mockState.rules.set(activationTokenEnvId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_auth_rules WHERE activation_token_auth_id = ?', [activationTokenAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_auth_evidence WHERE activation_token_auth_id = ?', [activationTokenAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_auth WHERE activation_token_auth_id = ?', [activationTokenAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_env_rules WHERE activation_token_env_id = ?', [activationTokenEnvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_env_evidence WHERE activation_token_env_id = ?', [activationTokenEnvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_env WHERE activation_token_env_id = ?', [activationTokenEnvId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_auth
       (activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_auth_status, activation_token_auth_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_auth_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_auth_rules_json, token_auth_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_handoff_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_token_auth_hash, token_auth_evidence_pack_hash, evidence_pack_hash)
       VALUES (?, 'ahf_test_156c', 'dec_test_156c', 'lock_test_156c', 'auth_test_156c', 'rd_test_156c', 'pln_test_156c', 'dsp_test_156c', 'env_test_156c', 'ath_test_156c', 'rd_test_156c', 'apv_test_156c', 'prep_test_156c', 'rev_test_156c', 'sim_test_156c', 'exec_test_156c', 'cohort_test_156c', 'tenant_test_156c', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'AUTHORIZED_NOT_ISSUED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"token_auth_mode":"TOKEN_ISSUANCE_AUTHORIZATION_ONLY", "allow_token_issue":false, "token_status":"PREPARED_NOT_ISSUED", "token_issuance_status":"AUTHORIZED_NOT_ISSUED", "token_redeemable":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'handoff_hash_156c', 'token_material_hash_156c', 'lock_hash_156c', 'EXECUTION_NOT_ENABLED', 'TOKEN_AUTH_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'token_auth_hash_156c', 'pack_hash_156c', 'pack_hash_156c')`,
      [activationTokenAuthId, JSON.stringify(nonExecution155), JSON.stringify(writeScope155)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_env
       (activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_env_status, activation_token_env_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_env_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_env_rules_json, token_env_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_token_auth_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'ahf_test_156c', 'dec_test_156c', 'lock_test_156c', 'auth_test_156c', 'rd_test_156c', 'pln_test_156c', 'dsp_test_156c', 'env_test_156c', 'ath_test_156c', 'rd_test_156c', 'apv_test_156c', 'prep_test_156c', 'rev_test_156c', 'sim_test_156c', 'exec_test_156c', 'cohort_test_156c', 'tenant_test_156c', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_token_env_evaluation":true}', ?, ?, 'token_auth_hash_156c', 'token_material_hash_156c', 'lock_hash_156c', 'EXECUTION_NOT_ENABLED', 'TOKEN_ENV_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        activationTokenEnvId,
        activationTokenAuthId,
        JSON.stringify(activeEnvConfig),
        JSON.stringify(nonExecution156),
        JSON.stringify(writeScope156)
      ]
    );
  }
}

(async () => {
  console.log('=== Smoke 156C: Activation Token Env Evaluator Rules ===\n');

  try {
    // 1. Positive: evaluate ready record with all metrics passing
    const a1 = 'ath_156c_1';
    const e1 = 'ate_156c_1';
    await setupTokenAuthAndTokenEnv(a1, e1, 'FINALIZED', 'AUTHORIZED_NOT_ISSUED');
    
    const passed = await evaluator.evaluateTokenEnv(e1, {
      security_officer_confirmed: true,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    assert.strictEqual(passed.success, true);
    let record = await tokenEnvBuilder.getTokenEnv(e1);
    assert.strictEqual(record.activation_token_env_status, 'EVALUATED');
    assert.strictEqual(record.activation_token_env_result, 'ENVELOPE_PREPARED_NOT_ISSUED');
    console.log('  PASS: Evaluated token envelope record successfully.');

    // 2. Negative: fail check if security officer is missing
    const a2 = 'ath_156c_2';
    const e2 = 'ate_156c_2';
    await setupTokenAuthAndTokenEnv(a2, e2, 'FINALIZED', 'AUTHORIZED_NOT_ISSUED');
    
    const passedFail = await evaluator.evaluateTokenEnv(e2, {
      security_officer_confirmed: false,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    assert.strictEqual(passedFail.success, false);
    record = await tokenEnvBuilder.getTokenEnv(e2);
    assert.strictEqual(record.activation_token_env_status, 'BLOCKED');
    assert.strictEqual(record.activation_token_env_result, 'ENVELOPE_BLOCKED_BY_GUARDRAIL');
    console.log('  PASS: Correctly failed evaluation when security officer confirmation is missing.');

    console.log('\nSmoke 156C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 156C:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
