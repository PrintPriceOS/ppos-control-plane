'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const issuanceBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const readinessBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationDecisionService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedReadiness(readinessId, issuanceId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase161_tables: true, wrote_phase128_to_160_operational_tables: false };
  const config = { redemption_readiness_mode: 'TOKEN_REDEMPTION_READINESS_ONLY', token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE', token_redemption_readiness_status: 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED', token_redeemable: false, allow_redemption_readiness_record: true, allow_usable_token_redeem: false, allow_token_redeem: false };

  const issuanceRecord = {
    activation_token_issuance_id: issuanceId, source_activation_token_preflight_id: 'atp_test_162d',
    source_activation_token_staging_id: 'ats_test_162d', source_activation_token_final_apv_id: 'apv_test_162d',
    source_activation_token_env_id: 'ate_test_162d', source_activation_handoff_id: 'ahf_test_162d',
    source_activation_decision_id: 'dec_test_162d', source_activation_lock_id: 'lock_test_162d',
    source_activation_auth_id: 'auth_test_162d', source_activation_readiness_id: 'rd_test_162d',
    source_plan_id: 'pln_test_162d', source_dispatcher_id: 'dsp_test_162d',
    source_envelope_id: 'env_test_162d', source_auth_id: 'ath_test_162d',
    source_readiness_id: 'rd_test_162d', source_approval_id: 'apv_test_162d', source_prep_id: 'prep_test_162d',
    activation_token_issuance_status: 'FINALIZED', activation_token_issuance_result: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: {},
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_preflight_hash: 'pfl_hash_162d', source_activation_token_staging_hash: 'stg_hash_162d',
    source_token_material_hash: 'token_material_hash_162d', source_freeze_package_hash: 'lock_hash_162d',
    activation_token_issuance_hash: 'iss_hash_162d', token_issuance_evidence_pack_hash: 'ep_hash_162d', evidence_pack_hash: 'ep_hash_162d',
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED', runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
  };

  const readinessRecord = {
    activation_token_redemption_readiness_id: readinessId, source_activation_token_issuance_id: issuanceId,
    source_activation_token_preflight_id: 'atp_test_162d', source_activation_token_staging_id: 'ats_test_162d',
    source_activation_token_final_apv_id: 'apv_test_162d', source_activation_token_env_id: 'ate_test_162d',
    source_activation_handoff_id: 'ahf_test_162d', source_activation_decision_id: 'dec_test_162d',
    source_activation_lock_id: 'lock_test_162d', source_activation_auth_id: 'auth_test_162d',
    source_activation_readiness_id: 'rd_test_162d', source_plan_id: 'pln_test_162d',
    source_dispatcher_id: 'dsp_test_162d', source_envelope_id: 'env_test_162d',
    source_auth_id: 'ath_test_162d', source_readiness_id: 'rd_test_162d',
    source_approval_id: 'apv_test_162d', source_prep_id: 'prep_test_162d',
    activation_token_redemption_readiness_status: 'FINALIZED',
    activation_token_redemption_readiness_result: 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: config,
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_issuance_hash: 'iss_hash_162d', source_activation_token_preflight_hash: 'pfl_hash_162d',
    source_activation_token_staging_hash: 'stg_hash_162d', source_token_material_hash: 'token_material_hash_162d',
    source_freeze_package_hash: 'lock_hash_162d', activation_token_redemption_readiness_hash: 'rdy_hash_162d',
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_REDEMPTION_READINESS_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED', runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
  };

  if (!isProdLike) {
    issuanceBuilder._mockState.tokenIssuance.set(issuanceId, issuanceRecord);
    issuanceBuilder._mockState.rules.set(issuanceId, []);
    readinessBuilder._mockState.tokenRedemptionReadiness.set(readinessId, readinessRecord);
    readinessBuilder._mockState.rules.set(readinessId, []);
  } else {
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
       VALUES (?, 'atp_test_162d', 'ats_test_162d', 'apv_test_162d', 'ate_test_162d', 'ahf_test_162d', 'dec_test_162d', 'lock_test_162d', 'auth_test_162d', 'rd_test_162d', 'pln_test_162d', 'dsp_test_162d', 'env_test_162d', 'ath_test_162d', 'rd_test_162d', 'apv_test_162d', 'prep_test_162d',
        'FINALIZED', 'ISSUANCE_RECORDED_NOT_REDEEMABLE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{}', ?, ?,
        'pfl_hash_162d', 'stg_hash_162d', 'token_material_hash_162d', 'lock_hash_162d',
        'iss_hash_162d', 'ep_hash_162d', 'ep_hash_162d',
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
       VALUES (?, ?, 'atp_test_162d', 'ats_test_162d', 'apv_test_162d', 'ate_test_162d', 'ahf_test_162d', 'dec_test_162d', 'lock_test_162d', 'auth_test_162d', 'rd_test_162d', 'pln_test_162d', 'dsp_test_162d', 'env_test_162d', 'ath_test_162d', 'rd_test_162d', 'apv_test_162d', 'prep_test_162d',
        'FINALIZED', 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, ?, ?,
        'iss_hash_162d', 'pfl_hash_162d', 'stg_hash_162d', 'token_material_hash_162d', 'lock_hash_162d',
        'rdy_hash_162d', 'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_READINESS_FINALIZED_NOT_REDEEMED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [readinessId, issuanceId, JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope)]
    );
  }
}

(async () => {
  console.log('=== Smoke 162D: Review Workflow Governance ===\n');

  try {
    const readinessId = 'atr_162d_1';
    const issuanceId = 'ati_162d_1';
    await setupFinalizedReadiness(readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionAuthDraft(readinessId, 'admin');
    const authId = draft.tokenRedemptionAuth.activation_token_redemption_auth_id;

    // 1. Finalize blocked before evaluation
    await assert.rejects(
      decisionSvc.finalizeRedemptionAuth(authId, 'admin'),
      /TOKEN_REDEMPTION_AUTH_NOT_PASSED/
    );
    console.log('  PASS: Finalization blocked before evaluation.');

    // 2. Evaluated -> Approved -> Finalized
    await evaluator.evaluateTokenRedemptionAuth(authId, {
      security_officer_confirmed: true, compliance_officer_confirmed: true, operations_director_confirmed: true
    }, 'admin');

    await decisionSvc.recordDecision(authId, 'APPROVE', 'Recording auth event', 'admin');
    const passedRecord = await builder.getTokenRedemptionAuth(authId);
    assert.strictEqual(passedRecord.activation_token_redemption_auth_status, 'AUTH_PASSED');

    const finalRecord = await decisionSvc.finalizeRedemptionAuth(authId, 'admin');
    assert.strictEqual(finalRecord.activation_token_redemption_auth_status, 'FINALIZED');
    assert.strictEqual(finalRecord.activation_token_redemption_auth_result, 'REDEMPTION_AUTHORIZED_NOT_REDEEMED');
    assert.strictEqual(finalRecord.execution_capability_status, 'EXECUTION_NOT_ENABLED');
    assert.strictEqual(finalRecord.plan_executable_status, 'NOT_EXECUTABLE');
    assert.strictEqual(finalRecord.job_creation_status, 'NO_REAL_JOB_CREATED');
    assert.strictEqual(finalRecord.queue_dispatch_status, 'NO_QUEUE_DISPATCHED');
    assert.strictEqual(finalRecord.runtime_mutation_status, 'ZERO_RUNTIME_MUTATION_CONFIRMED');
    console.log('  PASS: Activation token redemption auth finalized successfully with safe non-execution markers.');

    // 3. Mutations blocked on finalized record
    await assert.rejects(
      builder.updateTokenRedemptionAuth(authId, { activation_token_redemption_auth_status: 'DRAFT' }),
      /TOKEN_REDEMPTION_AUTH_IMMUTABLE/
    );
    console.log('  PASS: Modifications blocked on finalized token redemption auth.');

    console.log('\nSmoke 162D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 162D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
