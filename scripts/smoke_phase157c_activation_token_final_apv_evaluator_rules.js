'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const tokenEnvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenEnvBuilderService').serviceInstance;
const tokenFinalApvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenFinalApvBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenFinalApvEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupTokenEnvAndTokenFinalApv(activationTokenEnvId, activationTokenFinalApvId, status = 'FINALIZED', result = 'ENVELOPE_PREPARED_NOT_ISSUED', apvConfig = {}) {
  const writeScope156 = { writes_only_phase156_tables: true, wrote_phase128_to_155_operational_tables: false };
  const writeScope157 = { writes_only_phase157_tables: true, wrote_phase128_to_156_operational_tables: false };
  const nonExecution156 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution157 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const defaultApvConfig = {
    final_approval_mode: 'TOKEN_FINAL_ISSUANCE_APPROVAL_ONLY',
    token_final_approval_status: 'FINAL_APPROVED_NOT_ISSUED',
    token_status: 'PREPARED_NOT_ISSUED',
    token_issuance_status: 'FINAL_APPROVED_NOT_ISSUED',
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
    requires_future_token_staging_gate: true,
    requires_security_committee_chair_confirmation: true,
    requires_kill_switch: true,
    requires_rollback_authority: true,
    requires_token_env_hash_verification: true,
    immutable_after_finalization: true
  };
  const activeApvConfig = { ...defaultApvConfig, ...apvConfig };

  const tokenEnvRecord = {
    activation_token_env_id: activationTokenEnvId,
    source_activation_token_auth_id: 'ath_test_157c',
    source_activation_handoff_id: 'ahf_test_157c',
    source_activation_decision_id: 'dec_test_157c',
    source_activation_lock_id: 'lock_test_157c',
    source_activation_auth_id: 'auth_test_157c',
    source_activation_readiness_id: 'rd_test_157c',
    source_plan_id: 'pln_test_157c',
    source_dispatcher_id: 'dsp_test_157c',
    source_envelope_id: 'env_test_157c',
    source_auth_id: 'ath_test_157c',
    source_readiness_id: 'rd_test_157c',
    source_approval_id: 'apv_test_157c',
    source_prep_id: 'prep_test_157c',
    source_review_id: 'rev_test_157c',
    source_simulation_id: 'sim_test_157c',
    source_execution_id: 'exec_test_157c',
    cohort_id: 'cohort_test_157c',
    tenant_id: 'tenant_test_157c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_env_status: status,
    activation_token_env_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { token_envelope_mode: 'ISSUANCE_ENVELOPE_PREPARATION_ONLY', allow_token_issue: false, token_status: 'PREPARED_NOT_ISSUED', token_issuance_status: 'ENVELOPE_PREPARED_NOT_ISSUED', token_redeemable: false },
    token_env_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_env_rules_json: {},
    token_env_blockers_json: {},
    non_execution_attestation_json: nonExecution156,
    write_scope_attestation_json: writeScope156,
    source_activation_token_auth_hash: 'token_auth_hash_157c',
    source_token_material_hash: 'token_material_hash_157c',
    source_freeze_package_hash: 'lock_hash_157c',
    activation_token_env_hash: 'token_env_hash_157c',
    token_env_evidence_pack_hash: 'pack_hash_157c',
    evidence_pack_hash: 'pack_hash_157c',
    lineage_hash_chain_json: {},
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

  const tokenFinalApvRecord = {
    activation_token_final_apv_id: activationTokenFinalApvId,
    source_activation_token_env_id: activationTokenEnvId,
    source_activation_token_auth_id: 'ath_test_157c',
    source_activation_handoff_id: 'ahf_test_157c',
    source_activation_decision_id: 'dec_test_157c',
    source_activation_lock_id: 'lock_test_157c',
    source_activation_auth_id: 'auth_test_157c',
    source_activation_readiness_id: 'rd_test_157c',
    source_plan_id: 'pln_test_157c',
    source_dispatcher_id: 'dsp_test_157c',
    source_envelope_id: 'env_test_157c',
    source_auth_id: 'ath_test_157c',
    source_readiness_id: 'rd_test_157c',
    source_approval_id: 'apv_test_157c',
    source_prep_id: 'prep_test_157c',
    source_review_id: 'rev_test_157c',
    source_simulation_id: 'sim_test_157c',
    source_execution_id: 'exec_test_157c',
    cohort_id: 'cohort_test_157c',
    tenant_id: 'tenant_test_157c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_final_apv_status: 'DRAFT',
    activation_token_final_apv_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: activeApvConfig,
    token_final_apv_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_final_apv_rules_json: {},
    token_final_apv_blockers_json: { missing_token_final_apv_evaluation: true },
    non_execution_attestation_json: nonExecution157,
    write_scope_attestation_json: writeScope157,
    source_activation_token_env_hash: 'token_env_hash_157c',
    source_token_material_hash: 'token_material_hash_157c',
    source_freeze_package_hash: 'lock_hash_157c',
    activation_token_final_apv_hash: null,
    token_final_apv_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    security_chair_signature_json: {},
    final_approval_rationale_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_FINAL_APPROVAL_FINALIZED_NOT_EXECUTED',
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
    tokenEnvBuilder._mockState.tokenEnv.set(activationTokenEnvId, tokenEnvRecord);
    tokenFinalApvBuilder._mockState.tokenFinalApv.set(activationTokenFinalApvId, tokenFinalApvRecord);
    tokenFinalApvBuilder._mockState.rules.set(activationTokenFinalApvId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_env_rules WHERE activation_token_env_id = ?', [activationTokenEnvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_env_evidence WHERE activation_token_env_id = ?', [activationTokenEnvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_env WHERE activation_token_env_id = ?', [activationTokenEnvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_final_apv_rules WHERE activation_token_final_apv_id = ?', [activationTokenFinalApvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_final_apv_evidence WHERE activation_token_final_apv_id = ?', [activationTokenFinalApvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_final_apv WHERE activation_token_final_apv_id = ?', [activationTokenFinalApvId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_env
       (activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_env_status, activation_token_env_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_env_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_env_rules_json, token_env_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_token_auth_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, 'ath_test_157c', 'ahf_test_157c', 'dec_test_157c', 'lock_test_157c', 'auth_test_157c', 'rd_test_157c', 'pln_test_157c', 'dsp_test_157c', 'env_test_157c', 'ath_test_157c', 'rd_test_157c', 'apv_test_157c', 'prep_test_157c', 'rev_test_157c', 'sim_test_157c', 'exec_test_157c', 'cohort_test_157c', 'tenant_test_157c', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'ENVELOPE_PREPARED_NOT_ISSUED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"token_envelope_mode":"ISSUANCE_ENVELOPE_PREPARATION_ONLY", "allow_token_issue":false, "token_status":"PREPARED_NOT_ISSUED", "token_issuance_status":"ENVELOPE_PREPARED_NOT_ISSUED", "token_redeemable":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'token_auth_hash_157c', 'token_material_hash_157c', 'lock_hash_157c', 'EXECUTION_NOT_ENABLED', 'TOKEN_ENV_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [activationTokenEnvId, JSON.stringify(nonExecution156), JSON.stringify(writeScope156)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_env_evidence
       (evidence_id, activation_token_env_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '156.0', 'pack_hash_157c', '{}', '{}')`,
      ['ee_' + activationTokenEnvId, activationTokenEnvId]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_final_apv
       (activation_token_final_apv_id, source_activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_final_apv_status, activation_token_final_apv_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_final_apv_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_final_apv_rules_json, token_final_apv_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_token_env_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'ath_test_157c', 'ahf_test_157c', 'dec_test_157c', 'lock_test_157c', 'auth_test_157c', 'rd_test_157c', 'pln_test_157c', 'dsp_test_157c', 'env_test_157c', 'ath_test_157c', 'rd_test_157c', 'apv_test_157c', 'prep_test_157c', 'rev_test_157c', 'sim_test_157c', 'exec_test_157c', 'cohort_test_157c', 'tenant_test_157c', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_token_final_apv_evaluation":true}', ?, ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'TOKEN_FINAL_APPROVAL_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        activationTokenFinalApvId,
        activationTokenEnvId,
        JSON.stringify(activeApvConfig),
        JSON.stringify(nonExecution157),
        JSON.stringify(writeScope157),
        'token_env_hash_157c',
        'token_material_hash_157c',
        'lock_hash_157c'
      ]
    );
  }
}

(async () => {
  console.log('=== Smoke 157C: Activation Token Final Approval Evaluator Rules ===\n');

  try {
    // 1. Positive: evaluate ready record with all metrics passing
    const envId1 = 'ate_157c_1';
    const apvId1 = 'atf_157c_1';
    await setupTokenEnvAndTokenFinalApv(envId1, apvId1);
    
    const passed = await evaluator.evaluateTokenFinalApv(apvId1, {
      security_committee_chair_confirmed: true,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    const rec = await tokenFinalApvBuilder.getTokenFinalApv(apvId1);
    const pEnv = await tokenEnvBuilder.getTokenEnv(rec.source_activation_token_env_id);
    console.log('parentEnv:', JSON.stringify(pEnv, null, 2));
    console.log('record:', JSON.stringify(rec, null, 2));

    const rules = await tokenFinalApvBuilder.getRules(apvId1);
    console.log('Evaluated rules list for apvId1:', JSON.stringify(rules, null, 2));

    assert.strictEqual(passed.success, true);
    let record = await tokenFinalApvBuilder.getTokenFinalApv(apvId1);
    assert.strictEqual(record.activation_token_final_apv_status, 'EVALUATED');
    assert.strictEqual(record.activation_token_final_apv_result, 'FINAL_APPROVED_NOT_ISSUED');
    console.log('  PASS: Evaluated token final approval record successfully.');

    // 2. Negative: fail check if security chair signature is missing
    const envId2 = 'ate_157c_2';
    const apvId2 = 'atf_157c_2';
    await setupTokenEnvAndTokenFinalApv(envId2, apvId2);
    
    const passedFail = await evaluator.evaluateTokenFinalApv(apvId2, {
      security_committee_chair_confirmed: false,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    assert.strictEqual(passedFail.success, false);
    record = await tokenFinalApvBuilder.getTokenFinalApv(apvId2);
    assert.strictEqual(record.activation_token_final_apv_status, 'BLOCKED');
    assert.strictEqual(record.activation_token_final_apv_result, 'FINAL_APPROVAL_BLOCKED_BY_GUARDRAIL');
    console.log('  PASS: Correctly failed evaluation when security committee chair confirmation is missing.');

    console.log('\nSmoke 157C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 157C:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
