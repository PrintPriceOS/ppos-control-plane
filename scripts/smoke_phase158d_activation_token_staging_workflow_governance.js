'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const tokenFinalApvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenFinalApvBuilderService').serviceInstance;
const tokenStagingBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenStagingBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenStagingEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenStagingDecisionService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupTokenFinalApvAndStaging(apvId, stagingId, status = 'FINALIZED', result = 'FINAL_APPROVED_NOT_ISSUED') {
  const writeScope157 = { writes_only_phase157_tables: true, wrote_phase128_to_156_operational_tables: false };
  const writeScope158 = { writes_only_phase158_tables: true, wrote_phase128_to_157_operational_tables: false };
  const nonExecution157 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution158 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const stagingConfig = {
    staging_mode: 'TOKEN_STAGING_ONLY',
    token_staging_status: 'STAGED_NOT_ISSUED',
    token_status: 'STAGED_NOT_ISSUED',
    token_issuance_status: 'STAGED_NOT_ISSUED',
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
    requires_future_token_issuance_preflight_gate: true,
    requires_security_officer_confirmation: true,
    requires_compliance_officer_confirmation: true,
    requires_operations_director_confirmation: true,
    requires_final_approval_hash_verification: true,
    immutable_after_finalization: true
  };

  const apvRecord = {
    activation_token_final_apv_id: apvId,
    source_activation_token_env_id: 'ate_test_158d',
    source_activation_token_auth_id: 'ath_test_158d',
    source_activation_handoff_id: 'ahf_test_158d',
    source_activation_decision_id: 'dec_test_158d',
    source_activation_lock_id: 'lock_test_158d',
    source_activation_auth_id: 'auth_test_158d',
    source_activation_readiness_id: 'rd_test_158d',
    source_plan_id: 'pln_test_158d',
    source_dispatcher_id: 'dsp_test_158d',
    source_envelope_id: 'env_test_158d',
    source_auth_id: 'ath_test_158d',
    source_readiness_id: 'rd_test_158d',
    source_approval_id: 'apv_test_158d',
    source_prep_id: 'prep_test_158d',
    source_review_id: 'rev_test_158d',
    source_simulation_id: 'sim_test_158d',
    source_execution_id: 'exec_test_158d',
    cohort_id: 'cohort_test_158d',
    tenant_id: 'tenant_test_158d',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_final_apv_status: status,
    activation_token_final_apv_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { final_approval_mode: 'TOKEN_FINAL_ISSUANCE_APPROVAL_ONLY', allow_token_issue: false, token_status: 'PREPARED_NOT_ISSUED', token_issuance_status: 'FINAL_APPROVED_NOT_ISSUED', token_redeemable: false },
    token_final_apv_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_final_apv_rules_json: {},
    token_final_apv_blockers_json: {},
    non_execution_attestation_json: nonExecution157,
    write_scope_attestation_json: writeScope157,
    source_activation_token_env_hash: 'token_env_hash_158d',
    source_token_material_hash: 'token_material_hash_158d',
    source_freeze_package_hash: 'lock_hash_158d',
    activation_token_final_apv_hash: 'apv_hash_158d',
    token_final_apv_evidence_pack_hash: 'pack_hash_158d',
    evidence_pack_hash: 'pack_hash_158d',
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

  const stagingRecord = {
    activation_token_staging_id: stagingId,
    source_activation_token_final_apv_id: apvId,
    source_activation_token_env_id: 'ate_test_158d',
    source_activation_token_auth_id: 'ath_test_158d',
    source_activation_handoff_id: 'ahf_test_158d',
    source_activation_decision_id: 'dec_test_158d',
    source_activation_lock_id: 'lock_test_158d',
    source_activation_auth_id: 'auth_test_158d',
    source_activation_readiness_id: 'rd_test_158d',
    source_plan_id: 'pln_test_158d',
    source_dispatcher_id: 'dsp_test_158d',
    source_envelope_id: 'env_test_158d',
    source_auth_id: 'ath_test_158d',
    source_readiness_id: 'rd_test_158d',
    source_approval_id: 'apv_test_158d',
    source_prep_id: 'prep_test_158d',
    source_review_id: 'rev_test_158d',
    source_simulation_id: 'sim_test_158d',
    source_execution_id: 'exec_test_158d',
    cohort_id: 'cohort_test_158d',
    tenant_id: 'tenant_test_158d',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_staging_status: 'DRAFT',
    activation_token_staging_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: stagingConfig,
    token_staging_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_staging_rules_json: {},
    token_staging_blockers_json: { missing_token_staging_evaluation: true },
    non_execution_attestation_json: nonExecution158,
    write_scope_attestation_json: writeScope158,
    source_activation_token_final_apv_hash: 'apv_hash_158d',
    source_token_material_hash: 'token_material_hash_158d',
    source_freeze_package_hash: 'lock_hash_158d',
    activation_token_staging_hash: null,
    token_staging_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    staging_signatures_json: {},
    staging_metadata_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_STAGING_FINALIZED_NOT_EXECUTED',
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
    tokenFinalApvBuilder._mockState.tokenFinalApv.set(apvId, apvRecord);
    tokenStagingBuilder._mockState.tokenStaging.set(stagingId, stagingRecord);
    tokenStagingBuilder._mockState.rules.set(stagingId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_final_apv_rules WHERE activation_token_final_apv_id = ?', [apvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_final_apv_evidence WHERE activation_token_final_apv_id = ?', [apvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_final_apv WHERE activation_token_final_apv_id = ?', [apvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_staging_rules WHERE activation_token_staging_id = ?', [stagingId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_staging_evidence WHERE activation_token_staging_id = ?', [stagingId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_staging WHERE activation_token_staging_id = ?', [stagingId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_final_apv
       (activation_token_final_apv_id, source_activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_final_apv_status, activation_token_final_apv_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_final_apv_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_final_apv_rules_json, token_final_apv_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_token_env_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_final_apv_hash, token_final_apv_evidence_pack_hash, evidence_pack_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'ath_test_158d', 'ahf_test_158d', 'dec_test_158d', 'lock_test_158d', 'auth_test_158d', 'rd_test_158d', 'pln_test_158d', 'dsp_test_158d', 'env_test_158d', 'ath_test_158d', 'rd_test_158d', 'apv_test_158d', 'prep_test_158d', 'rev_test_158d', 'sim_test_158d', 'exec_test_158d', 'cohort_test_158d', 'tenant_test_158d', 'SIMULATE_COHORT_PAUSE',
        ?, ?, ?, ?, ?, ?, ?, 'PASS', 'PASS', ?, '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, ?, ?, ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'TOKEN_FINAL_APPROVAL_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        apvId,
        apvRecord.source_activation_token_env_id,
        status,
        result,
        apvRecord.risk_level,
        apvRecord.confidence_level,
        apvRecord.projected_impact_score,
        apvRecord.rollback_feasibility_score,
        apvRecord.evidence_completeness_score,
        JSON.stringify(apvRecord.canary_envelope_json),
        JSON.stringify(nonExecution157),
        JSON.stringify(writeScope157),
        apvRecord.source_activation_token_env_hash,
        apvRecord.source_token_material_hash,
        apvRecord.source_freeze_package_hash,
        apvRecord.activation_token_final_apv_hash,
        apvRecord.token_final_apv_evidence_pack_hash,
        apvRecord.evidence_pack_hash
      ]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_final_apv_evidence
       (evidence_id, activation_token_final_apv_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '157.0', 'pack_hash_158d', '{}', '{}')`,
      ['ee_' + apvId, apvId]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_staging
       (activation_token_staging_id, source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_staging_status, activation_token_staging_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_staging_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_staging_rules_json, token_staging_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_token_final_apv_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'ate_test_158d', 'ath_test_158d', 'ahf_test_158d', 'dec_test_158d', 'lock_test_158d', 'auth_test_158d', 'rd_test_158d', 'pln_test_158d', 'dsp_test_158d', 'env_test_158d', 'ath_test_158d', 'rd_test_158d', 'apv_test_158d', 'prep_test_158d', 'rev_test_158d', 'sim_test_158d', 'exec_test_158d', 'cohort_test_158d', 'tenant_test_158d', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_token_staging_evaluation":true}', ?, ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'TOKEN_STAGING_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        stagingId,
        apvId,
        JSON.stringify(stagingRecord.canary_envelope_json),
        JSON.stringify(nonExecution158),
        JSON.stringify(writeScope158),
        'apv_hash_158d',
        'token_material_hash_158d',
        'lock_hash_158d'
      ]
    );
  }
}

(async () => {
  console.log('=== Smoke 158D: Review Workflow Governance ===\n');

  try {
    const apvId = 'apv_158d_1';
    const stagingId = 'ats_158d_1';
    await setupTokenFinalApvAndStaging(apvId, stagingId);

    // 1. Cannot finalize in DRAFT state
    await assert.rejects(
      decisionSvc.finalizeStaging(stagingId, 'admin'),
      /TOKEN_STAGING_NOT_STAGED/
    );
    console.log('  PASS: Finalization blocked before evaluation.');

    // 2. Evaluate and approve staging
    await evaluator.evaluateTokenStaging(stagingId, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true,
      operations_director_confirmed: true
    }, 'admin');

    await decisionSvc.recordDecision(stagingId, 'APPROVE', 'Staging approved', 'admin');

    // 3. Finalize successfully
    const finalized = await decisionSvc.finalizeStaging(stagingId, 'admin');
    assert.strictEqual(finalized.activation_token_staging_status, 'FINALIZED');
    assert.strictEqual(finalized.activation_token_staging_result, 'STAGED_NOT_ISSUED');
    assert.ok(finalized.activation_token_staging_hash);
    console.log('  PASS: Activation token staging finalized successfully with safe non-execution markers.');

    // 4. Block modifications in FINALIZED state
    await assert.rejects(
      tokenStagingBuilder.updateTokenStaging(stagingId, { risk_level: 'HIGH' }),
      /TOKEN_STAGING_IMMUTABLE/
    );
    console.log('  PASS: Modifications blocked on finalized token staging.');

    console.log('\nSmoke 158D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 158D:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
