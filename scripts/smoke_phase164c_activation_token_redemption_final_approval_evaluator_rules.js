'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const issuanceBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const readinessBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
const authBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService').serviceInstance;
const envBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalEvaluatorService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedEnv(envId, authId, readinessId, issuanceId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase163_tables: true, wrote_phase128_to_162_operational_tables: false };
  const config = { redemption_envelope_mode: 'TOKEN_REDEMPTION_ENVELOPE_ONLY', token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE', token_redemption_envelope_status: 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED', token_redeemable: false, allow_redemption_envelope_record: true, allow_usable_token_redeem: false, allow_token_redeem: false };

  const issuanceRecord = {
    activation_token_issuance_id: issuanceId, source_activation_token_preflight_id: 'atp_test_164c',
    source_activation_token_staging_id: 'ats_test_164c', source_activation_token_final_apv_id: 'apv_test_164c',
    source_activation_token_env_id: 'ate_test_164c', source_activation_handoff_id: 'ahf_test_164c',
    source_activation_decision_id: 'dec_test_164c', source_activation_lock_id: 'lock_test_164c',
    source_activation_auth_id: 'auth_test_164c', source_activation_readiness_id: 'rd_test_164c',
    source_plan_id: 'pln_test_164c', source_dispatcher_id: 'dsp_test_164c',
    source_envelope_id: 'env_test_164c', source_auth_id: 'ath_test_164c',
    source_readiness_id: 'rd_test_164c', source_approval_id: 'apv_test_164c', source_prep_id: 'prep_test_164c',
    activation_token_issuance_status: 'FINALIZED', activation_token_issuance_result: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: {},
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_preflight_hash: 'pfl_hash_164c', source_activation_token_staging_hash: 'stg_hash_164c',
    source_token_material_hash: 'token_material_hash_164c', source_freeze_package_hash: 'lock_hash_164c',
    activation_token_issuance_hash: 'iss_hash_164c', token_issuance_evidence_pack_hash: 'ep_hash_164c', evidence_pack_hash: 'ep_hash_164c',
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED', runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
  };

  const readinessRecord = {
    activation_token_redemption_readiness_id: readinessId, source_activation_token_issuance_id: issuanceId,
    source_activation_token_preflight_id: 'atp_test_164c', source_activation_token_staging_id: 'ats_test_164c',
    source_activation_token_final_apv_id: 'apv_test_164c', source_activation_token_env_id: 'ate_test_164c',
    source_activation_handoff_id: 'ahf_test_164c', source_activation_decision_id: 'dec_test_164c',
    source_activation_lock_id: 'lock_test_164c', source_activation_auth_id: 'auth_test_164c',
    source_activation_readiness_id: 'rd_test_164c', source_plan_id: 'pln_test_164c',
    source_dispatcher_id: 'dsp_test_164c', source_envelope_id: 'env_test_164c',
    source_auth_id: 'ath_test_164c', source_readiness_id: 'rd_test_164c',
    source_approval_id: 'apv_test_164c', source_prep_id: 'prep_test_164c',
    activation_token_redemption_readiness_status: 'FINALIZED',
    activation_token_redemption_readiness_result: 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: config,
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_issuance_hash: 'iss_hash_164c', source_activation_token_preflight_hash: 'pfl_hash_164c',
    source_activation_token_staging_hash: 'stg_hash_164c', source_token_material_hash: 'token_material_hash_164c',
    source_freeze_package_hash: 'lock_hash_164c', activation_token_redemption_readiness_hash: 'rdy_hash_164c',
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_REDEMPTION_READINESS_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED', runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
  };

  const authRecord = {
    activation_token_redemption_auth_id: authId, source_activation_token_redemption_readiness_id: readinessId,
    source_activation_token_issuance_id: issuanceId, source_activation_token_preflight_id: 'atp_test_164c',
    source_activation_token_staging_id: 'ats_test_164c', source_activation_token_final_apv_id: 'apv_test_164c',
    source_activation_token_env_id: 'ate_test_164c', source_activation_handoff_id: 'ahf_test_164c',
    source_activation_decision_id: 'dec_test_164c', source_activation_lock_id: 'lock_test_164c',
    source_activation_auth_id: 'auth_test_164c', source_activation_readiness_id: 'rd_test_164c',
    source_plan_id: 'pln_test_164c', source_dispatcher_id: 'dsp_test_164c',
    source_envelope_id: 'env_test_164c', source_auth_id: 'ath_test_164c',
    source_readiness_id: 'rd_test_164c', source_approval_id: 'apv_test_164c', source_prep_id: 'prep_test_164c',
    activation_token_redemption_auth_status: 'FINALIZED',
    activation_token_redemption_auth_result: 'REDEMPTION_AUTHORIZED_NOT_REDEEMED',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: config,
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_redemption_readiness_hash: 'rdy_hash_164c', source_activation_token_issuance_hash: 'iss_hash_164c',
    source_activation_token_preflight_hash: 'pfl_hash_164c', source_activation_token_staging_hash: 'stg_hash_164c',
    source_token_material_hash: 'token_material_hash_164c', source_freeze_package_hash: 'lock_hash_164c',
    activation_token_redemption_auth_hash: 'ath_hash_164c', execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_REDEMPTION_AUTH_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED', runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
  };

  const envRecord = {
    activation_token_redemption_env_id: envId, source_activation_token_redemption_auth_id: authId,
    source_activation_token_redemption_readiness_id: readinessId, source_activation_token_issuance_id: issuanceId,
    source_activation_token_preflight_id: 'atp_test_164c', source_activation_token_staging_id: 'ats_test_164c',
    source_activation_token_final_apv_id: 'apv_test_164c', source_activation_token_env_id: 'ate_test_164c',
    source_activation_handoff_id: 'ahf_test_164c', source_activation_decision_id: 'dec_test_164c',
    source_activation_lock_id: 'lock_test_164c', source_activation_auth_id: 'auth_test_164c',
    source_activation_readiness_id: 'rd_test_164c', source_plan_id: 'pln_test_164c',
    source_dispatcher_id: 'dsp_test_164c', source_envelope_id: 'env_test_164c',
    source_auth_id: 'ath_test_164c', source_readiness_id: 'rd_test_164c',
    source_approval_id: 'apv_test_164c', source_prep_id: 'prep_test_164c',
    activation_token_redemption_envelope_status: 'FINALIZED',
    activation_token_redemption_envelope_result: 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: config,
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_redemption_authorization_hash: 'ath_hash_164c',
    source_activation_token_redemption_readiness_hash: 'rdy_hash_164c', source_activation_token_issuance_hash: 'iss_hash_164c',
    source_activation_token_preflight_hash: 'pfl_hash_164c', source_activation_token_staging_hash: 'stg_hash_164c',
    source_token_material_hash: 'token_material_hash_164c', source_freeze_package_hash: 'lock_hash_164c',
    activation_token_redemption_envelope_hash: 'env_hash_164c', execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_REDEMPTION_ENVELOPE_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED', runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
  };

  if (!isProdLike) {
    issuanceBuilder._mockState.tokenIssuance.set(issuanceId, issuanceRecord);
    readinessBuilder._mockState.tokenRedemptionReadiness.set(readinessId, readinessRecord);
    authBuilder._mockState.tokenRedemptionAuth.set(authId, authRecord);
    envBuilder._mockState.tokenRedemptionEnvelope.set(envId, envRecord);
    envBuilder._mockState.rules.set(envId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_env WHERE activation_token_redemption_env_id = ?', [envId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_auth WHERE activation_token_redemption_auth_id = ?', [authId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_readiness WHERE activation_token_redemption_readiness_id = ?', [readinessId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_issuance WHERE activation_token_issuance_id = ?', [issuanceId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_issuance
       (activation_token_issuance_id, source_activation_token_preflight_id, source_activation_token_staging_id, source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        activation_token_issuance_status, activation_token_issuance_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, non_execution_attestation_json, write_scope_attestation_json,
        source_activation_token_preflight_hash, source_activation_token_staging_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_issuance_hash, token_issuance_evidence_pack_hash, evidence_pack_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, 'atp_test_164c', 'ats_test_164c', 'apv_test_164c', 'ate_test_164c', 'ahf_test_164c', 'dec_test_164c', 'lock_test_164c', 'auth_test_164c', 'rd_test_164c', 'pln_test_164c', 'dsp_test_164c', 'env_test_164c', 'ath_test_164c', 'rd_test_164c', 'apv_test_164c', 'prep_test_164c',
        'FINALIZED', 'ISSUANCE_RECORDED_NOT_REDEEMABLE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{}', ?, ?,
        'pfl_hash_164c', 'stg_hash_164c', 'token_material_hash_164c', 'lock_hash_164c',
        'iss_hash_164c', 'ep_hash_164c', 'ep_hash_164c',
        'EXECUTION_NOT_ENABLED', 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [issuanceId, JSON.stringify(nonExecution), JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_readiness
       (activation_token_redemption_readiness_id, source_activation_token_issuance_id, source_activation_token_preflight_id, source_activation_token_staging_id, source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        activation_token_redemption_readiness_status, activation_token_redemption_readiness_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, non_execution_attestation_json, write_scope_attestation_json,
        source_activation_token_issuance_hash, source_activation_token_preflight_hash, source_activation_token_staging_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_redemption_readiness_hash, execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'atp_test_164c', 'ats_test_164c', 'apv_test_164c', 'ate_test_164c', 'ahf_test_164c', 'dec_test_164c', 'lock_test_164c', 'auth_test_164c', 'rd_test_164c', 'pln_test_164c', 'dsp_test_164c', 'env_test_164c', 'ath_test_164c', 'rd_test_164c', 'apv_test_164c', 'prep_test_164c',
        'FINALIZED', 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, ?, ?,
        'iss_hash_164c', 'pfl_hash_164c', 'stg_hash_164c', 'token_material_hash_164c', 'lock_hash_164c',
        'rdy_hash_164c', 'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_READINESS_FINALIZED_NOT_REDEEMED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [readinessId, issuanceId, JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_auth
       (activation_token_redemption_auth_id, source_activation_token_redemption_readiness_id, source_activation_token_issuance_id,
        source_activation_token_preflight_id, source_activation_token_staging_id, source_activation_token_final_apv_id,
        source_activation_token_env_id, source_activation_handoff_id, source_activation_decision_id,
        source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id,
        source_plan_id, source_dispatcher_id, source_envelope_id,
        source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_redemption_auth_status, activation_token_redemption_auth_result,
        risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_redemption_auth_summary_json,
        impact_review_json, rollback_review_json, guardrail_review_json,
        token_redemption_auth_rules_json, token_redemption_auth_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, non_redeemable_token_record_json, source_activation_token_redemption_readiness_hash,
        source_activation_token_issuance_hash, source_activation_token_preflight_hash, source_activation_token_staging_hash,
        source_token_material_hash, source_freeze_package_hash, activation_token_redemption_auth_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status,
        job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               'FINALIZED', 'REDEMPTION_AUTHORIZED_NOT_REDEEMED',
               ?, ?, ?, ?, ?,
               'PASS', 'PASS', ?, '{}', '{}', '{}', '{}', '{}',
               '{}', ?, ?, ?, 'rdy_hash_164c', 'iss_hash_164c', 'pfl_hash_164c', 'stg_hash_164c',
               'token_material_hash_164c', 'lock_hash_164c', 'ath_hash_164c',
               'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_AUTH_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
               'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        authId, readinessId, issuanceId,
        issuanceRecord.source_activation_token_preflight_id, issuanceRecord.source_activation_token_staging_id, issuanceRecord.source_activation_token_final_apv_id,
        issuanceRecord.source_activation_token_env_id, issuanceRecord.source_activation_handoff_id, issuanceRecord.source_activation_decision_id,
        issuanceRecord.source_activation_lock_id, issuanceRecord.source_activation_auth_id, issuanceRecord.source_activation_readiness_id,
        issuanceRecord.source_plan_id, issuanceRecord.source_dispatcher_id, issuanceRecord.source_envelope_id, issuanceRecord.source_auth_id,
        issuanceRecord.source_readiness_id, issuanceRecord.source_approval_id, issuanceRecord.source_prep_id, issuanceRecord.source_review_id,
        issuanceRecord.source_simulation_id, issuanceRecord.source_execution_id, issuanceRecord.cohort_id, issuanceRecord.tenant_id, issuanceRecord.simulation_type,
        issuanceRecord.risk_level, issuanceRecord.confidence_level, issuanceRecord.projected_impact_score, issuanceRecord.rollback_feasibility_score, issuanceRecord.evidence_completeness_score,
        JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope), JSON.stringify({})
      ]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_env
       (activation_token_redemption_env_id, source_activation_token_redemption_auth_id, source_activation_token_redemption_readiness_id,
        source_activation_token_issuance_id, source_activation_token_preflight_id, source_activation_token_staging_id,
        source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_handoff_id,
        source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id,
        source_plan_id, source_dispatcher_id, source_envelope_id,
        source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_redemption_envelope_status, activation_token_redemption_envelope_result,
        risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_redemption_envelope_summary_json,
        impact_review_json, rollback_review_json, guardrail_review_json,
        token_redemption_envelope_rules_json, token_redemption_envelope_blockers_json, non_execution_attestation_json,
        write_scope_attestation_json, non_redeemable_token_record_json, source_activation_token_redemption_authorization_hash,
        source_activation_token_redemption_readiness_hash, source_activation_token_issuance_hash, source_activation_token_preflight_hash,
        source_activation_token_staging_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_redemption_envelope_hash, execution_capability_status, activation_execution_status,
        package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               'FINALIZED', 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED',
               ?, ?, ?, ?, ?,
               'PASS', 'PASS', ?, '{}', '{}', '{}', '{}', '{}',
               '{}', ?, ?, ?, ?, ?, ?, ?, 'env_hash_164c',
               'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_ENVELOPE_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
               'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        envId, authId, readinessId, issuanceId,
        issuanceRecord.source_activation_token_preflight_id, issuanceRecord.source_activation_token_staging_id, issuanceRecord.source_activation_token_final_apv_id,
        issuanceRecord.source_activation_token_env_id, issuanceRecord.source_activation_handoff_id, issuanceRecord.source_activation_decision_id,
        issuanceRecord.source_activation_lock_id, issuanceRecord.source_activation_auth_id, issuanceRecord.source_activation_readiness_id,
        issuanceRecord.source_plan_id, issuanceRecord.source_dispatcher_id, issuanceRecord.source_envelope_id, issuanceRecord.source_auth_id,
        issuanceRecord.source_readiness_id, issuanceRecord.source_approval_id, issuanceRecord.source_prep_id, issuanceRecord.source_review_id,
        issuanceRecord.source_simulation_id, issuanceRecord.source_execution_id, issuanceRecord.cohort_id, issuanceRecord.tenant_id, issuanceRecord.simulation_type,
        issuanceRecord.risk_level, issuanceRecord.confidence_level, issuanceRecord.projected_impact_score, issuanceRecord.rollback_feasibility_score, issuanceRecord.evidence_completeness_score,
        JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope),
        'ath_hash_164c', 'rdy_hash_164c', 'iss_hash_164c', 'pfl_hash_164c', 'stg_hash_164c', 'token_material_hash_164c', 'lock_hash_164c'
      ]
    );
  }
}

(async () => {
  console.log('=== Smoke 164C: Activation Token Redemption Final Apv Evaluator Rules ===\n');

  try {
    const envId1 = 'ate_164c_1';
    const authId1 = 'ata_164c_1';
    const readinessId1 = 'atr_164c_1';
    const issuanceId1 = 'ati_164c_1';
    await setupFinalizedEnv(envId1, authId1, readinessId1, issuanceId1);
    const draft1 = await builder.createTokenRedemptionFinalApprovalDraft(envId1, 'admin');
    const approvalId1 = draft1.tokenRedemptionFinalApproval.activation_token_redemption_final_apv_id;

    const evalResult1 = await evaluator.evaluateTokenRedemptionFinalApproval(approvalId1, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true,
      operations_director_confirmed: true
    }, 'admin');

    assert.strictEqual(evalResult1.success, true, `Evaluation failed: ${JSON.stringify(evalResult1.blockers)}`);

    const rules = await builder.getRules(approvalId1);
    console.log(`Evaluated rules list for approvalId1:`, JSON.stringify(rules, null, 2));
    assert.ok(rules.length >= 8, `Expected at least 8 rules, got ${rules.length}`);
    const record1 = await builder.getTokenRedemptionFinalApproval(approvalId1);
    assert.strictEqual(record1.activation_token_redemption_final_apv_status, 'EVALUATED');
    assert.strictEqual(record1.activation_token_redemption_final_apv_result, 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED');
    console.log('  PASS: Evaluated redemption final approval record successfully.');

    // 2. Negative case: missing operations director signature
    const envId2 = 'ate_164c_2';
    const authId2 = 'ata_164c_2';
    const readinessId2 = 'atr_164c_2';
    const issuanceId2 = 'ati_164c_2';
    await setupFinalizedEnv(envId2, authId2, readinessId2, issuanceId2);
    const draft2 = await builder.createTokenRedemptionFinalApprovalDraft(envId2, 'admin');
    const approvalId2 = draft2.tokenRedemptionFinalApproval.activation_token_redemption_final_apv_id;
    const evalResult2 = await evaluator.evaluateTokenRedemptionFinalApproval(approvalId2, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true,
      operations_director_confirmed: false
    }, 'admin');
    assert.strictEqual(evalResult2.success, false);
    console.log('  PASS: Correctly failed evaluation when operations director confirmation is missing.');

    console.log('\nSmoke 164C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 164C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
