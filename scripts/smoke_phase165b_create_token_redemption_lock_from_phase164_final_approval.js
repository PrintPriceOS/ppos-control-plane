'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const issuanceBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const readinessBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
const authBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService').serviceInstance;
const envBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeBuilderService').serviceInstance;
const finalApvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedFinalApproval(finalApvId, envId, authId, readinessId, issuanceId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase164_tables: true, wrote_phase128_to_163_operational_tables: false };
  const config = { redemption_lock_mode: 'TOKEN_REDEMPTION_LOCK_PRE_REDEMPTION_FREEZE_ONLY', token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE', token_redeemable: false, allow_redemption_lock_record: true, allow_usable_token_redeem: false, allow_token_redeem: false };

  const issuanceRecord = {
    activation_token_issuance_id: issuanceId, source_activation_token_preflight_id: 'atp_test_165b',
    source_activation_token_staging_id: 'ats_test_165b', source_activation_token_final_apv_id: 'apv_test_165b',
    source_activation_token_env_id: 'ate_test_165b', source_activation_handoff_id: 'ahf_test_165b',
    source_activation_decision_id: 'dec_test_165b', source_activation_lock_id: 'lock_test_165b',
    source_activation_auth_id: 'auth_test_165b', source_activation_readiness_id: 'rd_test_165b',
    source_plan_id: 'pln_test_165b', source_dispatcher_id: 'dsp_test_165b',
    source_envelope_id: 'env_test_165b', source_auth_id: 'ath_test_165b',
    source_readiness_id: 'rd_test_165b', source_approval_id: 'apv_test_165b', source_prep_id: 'prep_test_165b',
    activation_token_issuance_status: 'FINALIZED', activation_token_issuance_result: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: {},
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_preflight_hash: 'pfl_hash_165b', source_activation_token_staging_hash: 'stg_hash_165b',
    source_token_material_hash: 'token_material_hash_165b', source_freeze_package_hash: 'lock_hash_165b',
    activation_token_issuance_hash: 'iss_hash_165b', token_issuance_evidence_pack_hash: 'ep_hash_165b', evidence_pack_hash: 'ep_hash_165b',
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED', runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
  };

  const readinessRecord = {
    activation_token_redemption_readiness_id: readinessId, source_activation_token_issuance_id: issuanceId,
    source_activation_token_preflight_id: 'atp_test_165b', source_activation_token_staging_id: 'ats_test_165b',
    source_activation_token_final_apv_id: 'apv_test_165b', source_activation_token_env_id: 'ate_test_165b',
    source_activation_handoff_id: 'ahf_test_165b', source_activation_decision_id: 'dec_test_165b',
    source_activation_lock_id: 'lock_test_165b', source_activation_auth_id: 'auth_test_165b',
    source_activation_readiness_id: 'rd_test_165b', source_plan_id: 'pln_test_165b',
    source_dispatcher_id: 'dsp_test_165b', source_envelope_id: 'env_test_165b',
    source_auth_id: 'ath_test_165b', source_readiness_id: 'rd_test_165b',
    source_approval_id: 'apv_test_165b', source_prep_id: 'prep_test_165b',
    activation_token_redemption_readiness_status: 'FINALIZED',
    activation_token_redemption_readiness_result: 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: config,
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_issuance_hash: 'iss_hash_165b', source_activation_token_preflight_hash: 'pfl_hash_165b',
    source_activation_token_staging_hash: 'stg_hash_165b', source_token_material_hash: 'token_material_hash_165b',
    source_freeze_package_hash: 'lock_hash_165b', activation_token_redemption_readiness_hash: 'rdy_hash_165b',
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_REDEMPTION_READINESS_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED', runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
  };

  const authRecord = {
    activation_token_redemption_auth_id: authId, source_activation_token_redemption_readiness_id: readinessId,
    source_activation_token_issuance_id: issuanceId, source_activation_token_preflight_id: 'atp_test_165b',
    source_activation_token_staging_id: 'ats_test_165b', source_activation_token_final_apv_id: 'apv_test_165b',
    source_activation_token_env_id: 'ate_test_165b', source_activation_handoff_id: 'ahf_test_165b',
    source_activation_decision_id: 'dec_test_165b', source_activation_lock_id: 'lock_test_165b',
    source_activation_auth_id: 'auth_test_165b', source_activation_readiness_id: 'rd_test_165b',
    source_plan_id: 'pln_test_165b', source_dispatcher_id: 'dsp_test_165b',
    source_envelope_id: 'env_test_165b', source_auth_id: 'ath_test_165b',
    source_readiness_id: 'rd_test_165b', source_approval_id: 'apv_test_165b', source_prep_id: 'prep_test_165b',
    activation_token_redemption_auth_status: 'FINALIZED',
    activation_token_redemption_auth_result: 'REDEMPTION_AUTHORIZED_NOT_REDEEMED',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS', canary_envelope_json: config,
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_redemption_readiness_hash: 'rdy_hash_165b', source_activation_token_issuance_hash: 'iss_hash_165b',
    source_activation_token_preflight_hash: 'pfl_hash_165b', source_activation_token_staging_hash: 'stg_hash_165b',
    source_token_material_hash: 'token_material_hash_165b', source_freeze_package_hash: 'lock_hash_165b',
    activation_token_redemption_auth_hash: 'ath_hash_165b', execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_REDEMPTION_AUTH_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED', runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
  };

  if (!isProdLike) {
    issuanceBuilder._mockState.tokenIssuance.set(issuanceId, issuanceRecord);
    readinessBuilder._mockState.tokenRedemptionReadiness.set(readinessId, readinessRecord);
    authBuilder._mockState.tokenRedemptionAuth.set(authId, authRecord);
    authBuilder._mockState.rules.set(authId, []);
    envBuilder._mockState.tokenRedemptionEnvelope.set(envId, {
      activation_token_redemption_env_id: envId,
      source_activation_token_redemption_auth_id: authId,
      activation_token_redemption_envelope_status: 'FINALIZED',
      activation_token_redemption_envelope_result: 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED',
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_REDEMPTION_ENVELOPE_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      activation_token_redemption_envelope_hash: 'env_hash_165b'
    });
    envBuilder._mockState.rules.set(envId, []);
    finalApvBuilder._mockState.tokenRedemptionFinalApproval.set(finalApvId, {
      activation_token_redemption_final_apv_id: finalApvId,
      source_activation_token_redemption_env_id: envId,
      source_activation_token_redemption_auth_id: authId,
      source_activation_token_redemption_readiness_id: readinessId,
      source_activation_token_issuance_id: issuanceId,
      activation_token_redemption_final_apv_status: 'FINALIZED',
      activation_token_redemption_final_apv_result: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_REDEMPTION_FINAL_APPROVAL_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      activation_token_redemption_final_apv_hash: 'fapv_hash_165b',
      risk_level: 'LOW', confidence_level: 'HIGH',
      projected_impact_score: 35.0, rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
      guardrail_status: 'PASS', write_scope_status: 'PASS',
      canary_envelope_json: config, non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
      token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
      token_redemption_final_apv_status_val: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
      token_redemption_status: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
      token_redeemable_status: 'NOT_REDEEMABLE'
    });
    finalApvBuilder._mockState.rules.set(finalApvId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_fapv WHERE activation_token_redemption_final_apv_id = ?', [finalApvId]);
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
       VALUES (?, 'atp_test_165b', 'ats_test_165b', 'apv_test_165b', 'ate_test_165b', 'ahf_test_165b', 'dec_test_165b', 'lock_test_165b', 'auth_test_165b', 'rd_test_165b', 'pln_test_165b', 'dsp_test_165b', 'env_test_165b', 'ath_test_165b', 'rd_test_165b', 'apv_test_165b', 'prep_test_165b',
        'FINALIZED', 'ISSUANCE_RECORDED_NOT_REDEEMABLE', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{}', ?, ?,
        'pfl_hash_165b', 'stg_hash_165b', 'token_material_hash_165b', 'lock_hash_165b',
        'iss_hash_165b', 'ep_hash_165b', 'ep_hash_165b',
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
       VALUES (?, ?, 'atp_test_165b', 'ats_test_165b', 'apv_test_165b', 'ate_test_165b', 'ahf_test_165b', 'dec_test_165b', 'lock_test_165b', 'auth_test_165b', 'rd_test_165b', 'pln_test_165b', 'dsp_test_165b', 'env_test_165b', 'ath_test_165b', 'rd_test_165b', 'apv_test_165b', 'prep_test_165b',
        'FINALIZED', 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', ?, ?, ?,
        'iss_hash_165b', 'pfl_hash_165b', 'stg_hash_165b', 'token_material_hash_165b', 'lock_hash_165b',
        'rdy_hash_165b', 'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_READINESS_FINALIZED_NOT_REDEEMED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
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
       VALUES (?, ?, ?, 'atp_test_165b', 'ats_test_165b', 'apv_test_165b', 'ate_test_165b', 'ahf_test_165b', 'dec_test_165b',
               'lock_test_165b', 'auth_test_165b', 'rd_test_165b', 'pln_test_165b', 'dsp_test_165b', 'env_test_165b',
               'ath_test_165b', 'rd_test_165b', 'apv_test_165b', 'prep_test_165b',
               'FINALIZED', 'REDEMPTION_AUTHORIZED_NOT_REDEEMED',
               'LOW', 'HIGH', 35.0, 80.0, 95.0,
               'PASS', 'PASS', ?, '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, ?,
               'rdy_hash_165b', 'iss_hash_165b', 'pfl_hash_165b', 'stg_hash_165b',
               'token_material_hash_165b', 'lock_hash_165b', 'ath_hash_165b',
               'EXECUTION_NOT_ENABLED', 'TOKEN_REDEMPTION_AUTH_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
               'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [authId, readinessId, issuanceId, JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope), JSON.stringify({})]
    );

    // Use real builder to insert envelope
    const createdEnv = await envBuilder.createTokenRedemptionEnvelopeDraft(authId, 'admin');
    await envBuilder._internalUpdateTokenRedemptionEnvelope(createdEnv.tokenRedemptionEnvelope.activation_token_redemption_env_id, {
      activation_token_redemption_env_id: envId,
      activation_token_redemption_envelope_status: 'FINALIZED',
      activation_token_redemption_envelope_result: 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED',
      activation_token_redemption_envelope_hash: 'env_hash_165b'
    });

    // Use real builder to insert final approval
    const createdFApv = await finalApvBuilder.createTokenRedemptionFinalApprovalDraft(envId, 'admin');
    await finalApvBuilder._internalUpdateTokenRedemptionFinalApproval(createdFApv.tokenRedemptionFinalApproval.activation_token_redemption_final_apv_id, {
      activation_token_redemption_final_apv_id: finalApvId,
      activation_token_redemption_final_apv_status: 'FINALIZED',
      activation_token_redemption_final_apv_result: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
      activation_token_redemption_final_apv_hash: 'fapv_hash_165b'
    });
  }
}

(async () => {
  console.log('=== Smoke 165B: Create Token Redemption Lock Draft ===\n');

  try {
    const finalApvId = 'atfa_165b_1';
    const envId = 'ate_165b_1';
    const authId = 'ata_165b_1';
    const readinessId = 'atr_165b_1';
    const issuanceId = 'ati_165b_1';
    await setupFinalizedFinalApproval(finalApvId, envId, authId, readinessId, issuanceId);

    const result = await builder.createTokenRedemptionLockDraft(finalApvId, 'admin');
    assert.ok(result.tokenRedemptionLock);
    assert.strictEqual(result.tokenRedemptionLock.activation_token_redemption_lock_status, 'DRAFT');
    assert.strictEqual(result.tokenRedemptionLock.source_activation_token_redemption_final_apv_id, finalApvId);
    console.log('  PASS: Draft redemption lock created successfully from Phase 164 final approval.');

    // Negative case: draft from non-finalized final approval
    if (!isProdLike) {
      finalApvBuilder._mockState.tokenRedemptionFinalApproval.set('fapv_invalid', {
        activation_token_redemption_final_apv_id: 'fapv_invalid',
        activation_token_redemption_final_apv_status: 'DRAFT'
      });
    } else {
      await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_fapv WHERE activation_token_redemption_final_apv_id = ?', ['fapv_invalid']);
      const createdEnv = await envBuilder.createTokenRedemptionEnvelopeDraft('ata_invalid_dummy', 'admin');
      const createdFApv = await finalApvBuilder.createTokenRedemptionFinalApprovalDraft(createdEnv.tokenRedemptionEnvelope.activation_token_redemption_env_id, 'admin');
      await db.query(
        'UPDATE cb_cohort_intervention_activation_token_redempt_fapv SET activation_token_redemption_final_apv_id = ? WHERE activation_token_redemption_final_apv_id = ?',
        ['fapv_invalid', createdFApv.tokenRedemptionFinalApproval.activation_token_redemption_final_apv_id]
      );
    }

    await assert.rejects(
      builder.createTokenRedemptionLockDraft('fapv_invalid', 'admin'),
      /TOKEN_REDEMPTION_FINAL_APPROVAL_NOT_READY/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized final approval.');

    console.log('\nSmoke 165B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 165B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
