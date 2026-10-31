'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const tokenEnvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenEnvBuilderService').serviceInstance;
const tokenEnvEvidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenEnvEvidencePackService').serviceInstance;
const tokenFinalApvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenFinalApvBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenFinalApvEvaluatorService').serviceInstance;
const decision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenFinalApvDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenFinalApvEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupTokenEnvAndTokenFinalApv(activationTokenEnvId, activationTokenFinalApvId) {
  const writeScope156 = { writes_only_phase156_tables: true, wrote_phase128_to_155_operational_tables: false };
  const writeScope157 = { writes_only_phase157_tables: true, wrote_phase128_to_156_operational_tables: false };
  const nonExecution156 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution157 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const tokenEnvRecord = {
    activation_token_env_id: activationTokenEnvId,
    source_activation_token_auth_id: 'ath_test_157d',
    source_activation_handoff_id: 'ahf_test_157d',
    source_activation_decision_id: 'dec_test_157d',
    source_activation_lock_id: 'lock_test_157d',
    source_activation_auth_id: 'auth_test_157d',
    source_activation_readiness_id: 'rd_test_157d',
    source_plan_id: 'pln_test_157d',
    source_dispatcher_id: 'dsp_test_157d',
    source_envelope_id: 'env_test_157d',
    source_auth_id: 'ath_test_157d',
    source_readiness_id: 'rd_test_157d',
    source_approval_id: 'apv_test_157d',
    source_prep_id: 'prep_test_157d',
    source_review_id: 'rev_test_157d',
    source_simulation_id: 'sim_test_157d',
    source_execution_id: 'exec_test_157d',
    cohort_id: 'cohort_test_157d',
    tenant_id: 'tenant_test_157d',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_env_status: 'FINALIZED',
    activation_token_env_result: 'ENVELOPE_PREPARED_NOT_ISSUED',
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
    source_activation_token_auth_hash: 'token_auth_hash_157d',
    source_token_material_hash: 'token_material_hash_157d',
    source_freeze_package_hash: 'lock_hash_157d',
    activation_token_env_hash: 'token_env_hash_157d',
    token_env_evidence_pack_hash: 'pack_hash_157d',
    evidence_pack_hash: 'pack_hash_157d',
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
    source_activation_token_auth_id: 'ath_test_157d',
    source_activation_handoff_id: 'ahf_test_157d',
    source_activation_decision_id: 'dec_test_157d',
    source_activation_lock_id: 'lock_test_157d',
    source_activation_auth_id: 'auth_test_157d',
    source_activation_readiness_id: 'rd_test_157d',
    source_plan_id: 'pln_test_157d',
    source_dispatcher_id: 'dsp_test_157d',
    source_envelope_id: 'env_test_157d',
    source_auth_id: 'ath_test_157d',
    source_readiness_id: 'rd_test_157d',
    source_approval_id: 'apv_test_157d',
    source_prep_id: 'prep_test_157d',
    source_review_id: 'rev_test_157d',
    source_simulation_id: 'sim_test_157d',
    source_execution_id: 'exec_test_157d',
    cohort_id: 'cohort_test_157d',
    tenant_id: 'tenant_test_157d',
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
    canary_envelope_json: { final_approval_mode: 'TOKEN_FINAL_ISSUANCE_APPROVAL_ONLY', allow_token_issue: false },
    token_final_apv_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_final_apv_rules_json: {},
    token_final_apv_blockers_json: { missing_token_final_apv_evaluation: true },
    non_execution_attestation_json: nonExecution157,
    write_scope_attestation_json: writeScope157,
    source_activation_token_env_hash: 'token_env_hash_157d',
    source_token_material_hash: 'token_material_hash_157d',
    source_freeze_package_hash: 'lock_hash_157d',
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
    tokenEnvEvidenceSvc._mockState.evidence.set(activationTokenEnvId, {
      evidence_pack_hash: 'pack_hash_157d',
      evidence_payload_json: { evidence_schema_version: '156.0', write_scope_attestation: writeScope156 },
      lineage_hash_chain_json: {
        phase156_activation_token_env_id: activationTokenEnvId,
        phase155_activation_token_auth_id: 'ath_test_157d',
        phase155_source_activation_token_auth_hash: 'token_auth_hash_d',
        phase154_activation_handoff_id: 'ahf_test_157d',
        phase154_source_activation_handoff_hash: 'handoff_hash_d',
        phase153_activation_decision_id: 'dec_test_157d',
        phase153_source_activation_decision_hash: 'dec_hash_d',
        phase152_source_activation_lock_hash: 'lock_hash_d',
        phase151_source_activation_authorization_hash: 'auth_hash_d',
        phase150_source_activation_readiness_hash: 'rd_hash_d',
        phase149_source_plan_hash: 'plan_hash_d',
        phase148_source_dispatcher_hash: 'dsp_hash_d',
        phase147_source_envelope_hash: 'env_hash_d',
        phase146_source_auth_hash: 'auth_hash_d',
        phase145_source_readiness_hash: 'rd_hash_d',
        phase144_source_approval_hash: 'apv_hash_d',
        phase143_preparation_id: 'prep_test_157d',
        phase142_review_id: 'rev_test_157d',
        phase141_source_simulation_hash: 'sim_hash_d',
        phase140_source_execution_hash: 'parent_exec_hash',
        phase139_source_approval_hash: 'parent_approval_hash',
        phase138_source_preparation_hash: 'parent_prep_hash',
        phase137_source_review_hash: 'parent_rev_hash'
      }
    });
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
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_token_env_hash, token_env_evidence_pack_hash, evidence_pack_hash)
       VALUES (?, 'ath_test_157d', 'ahf_test_157d', 'dec_test_157d', 'lock_test_157d', 'auth_test_157d', 'rd_test_157d', 'pln_test_157d', 'dsp_test_157d', 'env_test_157d', 'ath_test_157d', 'rd_test_157d', 'apv_test_157d', 'prep_test_157d', 'rev_test_157d', 'sim_test_157d', 'exec_test_157d', 'cohort_test_157d', 'tenant_test_157d', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'ENVELOPE_PREPARED_NOT_ISSUED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"token_envelope_mode":"ISSUANCE_ENVELOPE_PREPARATION_ONLY", "allow_token_issue":false, "token_status":"PREPARED_NOT_ISSUED", "token_issuance_status":"ENVELOPE_PREPARED_NOT_ISSUED", "token_redeemable":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'token_auth_hash_157d', 'token_material_hash_157d', 'lock_hash_157d', 'EXECUTION_NOT_ENABLED', 'TOKEN_ENV_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'token_env_hash_157d', 'pack_hash_157d', 'pack_hash_157d')`,
      [activationTokenEnvId, JSON.stringify(nonExecution156), JSON.stringify(writeScope156)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_env_evidence
       (evidence_id, activation_token_env_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '156.0', 'pack_hash_157d', ?, ?)`,
      [
        'ee_' + activationTokenEnvId,
        activationTokenEnvId,
        JSON.stringify({ evidence_schema_version: '156.0', write_scope_attestation: writeScope156 }),
        JSON.stringify({
          phase156_activation_token_env_id: activationTokenEnvId,
          phase155_activation_token_auth_id: 'ath_test_157d',
          phase155_source_activation_token_auth_hash: 'token_auth_hash_d',
          phase154_activation_handoff_id: 'ahf_test_157d',
          phase154_source_activation_handoff_hash: 'handoff_hash_d',
          phase153_activation_decision_id: 'dec_test_157d',
          phase153_source_activation_decision_hash: 'dec_hash_d',
          phase152_source_activation_lock_hash: 'lock_hash_d',
          phase151_source_activation_authorization_hash: 'auth_hash_d',
          phase150_source_activation_readiness_hash: 'rd_hash_d',
          phase149_source_plan_hash: 'plan_hash_d',
          phase148_source_dispatcher_hash: 'dsp_hash_d',
          phase147_source_envelope_hash: 'env_hash_d',
          phase146_source_auth_hash: 'auth_hash_d',
          phase145_source_readiness_hash: 'rd_hash_d',
          phase144_source_approval_hash: 'apv_hash_d',
          phase143_preparation_id: 'prep_test_157d',
          phase142_review_id: 'rev_test_157d',
          phase141_source_simulation_hash: 'sim_hash_d',
          phase140_source_execution_hash: 'parent_exec_hash',
          phase139_source_approval_hash: 'parent_approval_hash',
          phase138_source_preparation_hash: 'parent_prep_hash',
          phase137_source_review_hash: 'parent_rev_hash'
        })
      ]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_final_apv
       (activation_token_final_apv_id, source_activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_final_apv_status, activation_token_final_apv_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_final_apv_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_final_apv_rules_json, token_final_apv_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_token_env_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'ath_test_157d', 'ahf_test_157d', 'dec_test_157d', 'lock_test_157d', 'auth_test_157d', 'rd_test_157d', 'pln_test_157d', 'dsp_test_157d', 'env_test_157d', 'ath_test_157d', 'rd_test_157d', 'apv_test_157d', 'prep_test_157d', 'rev_test_157d', 'sim_test_157d', 'exec_test_157d', 'cohort_test_157d', 'tenant_test_157d', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_token_final_apv_evaluation":true}', ?, ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'TOKEN_FINAL_APPROVAL_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        activationTokenFinalApvId,
        activationTokenEnvId,
        JSON.stringify({ final_approval_mode: 'TOKEN_FINAL_ISSUANCE_APPROVAL_ONLY', allow_token_issue: false }),
        JSON.stringify(nonExecution157),
        JSON.stringify(writeScope157),
        'token_env_hash_157d',
        'token_material_hash_157d',
        'lock_hash_157d'
      ]
    );
  }
}

(async () => {
  console.log('=== Smoke 157D: Review Workflow Governance ===\n');

  try {
    const activationTokenEnvId = 'ate_157d_1';
    const activationTokenFinalApvId = 'atf_157d_1';
    await setupTokenEnvAndTokenFinalApv(activationTokenEnvId, activationTokenFinalApvId);

    // 1. Finalization blocks before evaluation
    try {
      await decision.finalizeTokenFinalApv(activationTokenFinalApvId, 'admin');
      assert.fail('Should block finalization when evaluation/decision are not done');
    } catch (e) {
      if (e.message.includes('TOKEN_FINAL_APV_EVALUATION_NOT_COMPLETED') || e.message.includes('TOKEN_FINAL_APV_RESULT_REQUIRED')) {
        console.log('  PASS: Finalization blocked before evaluation.');
      } else {
        throw e;
      }
    }

    // 2. Evaluate
    await evaluator.evaluateTokenFinalApv(activationTokenFinalApvId, {
      security_committee_chair_confirmed: true,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    // 3. Record decision
    await decision.recordDecision(activationTokenFinalApvId, 'FINAL_APPROVED_NOT_ISSUED', 'Activation token final approval recorded complete.', 'admin');

    // 4. Build evidence
    await evidenceSvc.buildEvidencePack(activationTokenFinalApvId, 'admin');

    // 5. Finalize
    const { tokenFinalApv: finalRecord } = await decision.finalizeTokenFinalApv(activationTokenFinalApvId, 'admin');
    assert.strictEqual(finalRecord.activation_token_final_apv_status, 'FINALIZED');
    assert.strictEqual(finalRecord.execution_capability_status, 'EXECUTION_NOT_ENABLED');
    assert.strictEqual(finalRecord.activation_execution_status, 'TOKEN_FINAL_APPROVAL_FINALIZED_NOT_EXECUTED');
    console.log('  PASS: Activation token final approval finalized successfully with safe non-execution markers.');

    // 6. Block modification after finalization
    try {
      await decision.recordDecision(activationTokenFinalApvId, 'FINAL_APPROVAL_BLOCKED_BY_GUARDRAIL', 'Change mind', 'admin');
      assert.fail('Should block modifications on finalized token approval');
    } catch (e) {
      if (e.message.includes('TOKEN_FINAL_APV_RECORD_ALREADY_FINALIZED')) {
        console.log('  PASS: Modifications blocked on finalized token approval.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 157D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 157D:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
