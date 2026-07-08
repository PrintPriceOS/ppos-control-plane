'use strict';

const db = require('../src/api/services/mysqlClient');
const issuanceBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const readinessBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
const authBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService').serviceInstance;
const envBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeBuilderService').serviceInstance;
const finalApvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalBuilderService').serviceInstance;
const lockBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService').serviceInstance;
const lockEvaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockEvaluatorService').serviceInstance;
const lockDecisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockDecisionService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedRedemptionLock(lockId, finalApvId, envId, authId, readinessId, issuanceId) {
  const config = { redemption_lock_mode: 'TOKEN_REDEMPTION_LOCK_PRE_REDEMPTION_FREEZE_ONLY', token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE', token_redeemable: false };
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase164_tables: true, wrote_phase128_to_163_operational_tables: false };

  if (!isProdLike) {
    // 1. Seed final approval mock
    finalApvBuilder._mockState.tokenRedemptionFinalApproval.set(finalApvId, {
      activation_token_redemption_final_apv_id: finalApvId,
      source_activation_token_redemption_env_id: envId,
      activation_token_redemption_final_apv_status: 'FINALIZED',
      activation_token_redemption_final_apv_result: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_REDEMPTION_FINAL_APPROVAL_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED', activation_token_redemption_final_apv_hash: 'fapv_hash_165b',
      risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0,
      evidence_completeness_score: 95.0, guardrail_status: 'PASS', write_scope_status: 'PASS',
      canary_envelope_json: config, non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
      token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
      token_redemption_final_apv_status_val: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
      token_redemption_status: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
      token_redeemable_status: 'NOT_REDEEMABLE'
    });
    finalApvBuilder._mockState.rules.set(finalApvId, []);

    // 2. Seed lock mock
    lockBuilder._mockState.tokenRedemptionLock.set(lockId, {
      activation_token_redemption_lock_id: lockId,
      source_activation_token_redemption_final_apv_id: finalApvId,
      activation_token_redemption_lock_status: 'FINALIZED',
      activation_token_redemption_lock_result: 'LOCKED_NOT_REDEEMED',
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
      token_redemption_lock_status_val: 'LOCKED_NOT_REDEEMED',
      token_redemption_status: 'LOCKED_NOT_REDEEMED',
      token_redeemable_status: 'NOT_REDEEMABLE',
      activation_execution_status: 'TOKEN_REDEMPTION_LOCK_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      activation_token_redemption_lock_hash: 'lock_hash_166',
      source_freeze_package_hash: 'freeze_hash_166',
      source_token_material_hash: 'token_material_hash_166',
      risk_level: 'LOW',
      confidence_level: 'HIGH',
      projected_impact_score: 35.0,
      rollback_feasibility_score: 80.0,
      evidence_completeness_score: 95.0,
      guardrail_status: 'PASS',
      write_scope_status: 'PASS',
      write_scope_attestation_json: { writes_only_phase165_tables: true, wrote_phase128_to_164_operational_tables: false },
      created_by: 'admin',
      updated_by: 'admin'
    });
    lockBuilder._mockState.rules.set(lockId, []);
  } else {
    // 1. Clear database tables sequentially to prevent primary key / foreign key conflicts
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_elig_ev WHERE activation_token_redemption_unlock_eligibility_id IN (SELECT activation_token_redemption_unlock_eligibility_id FROM cb_cohort_intervention_activation_token_redempt_unlock_elig WHERE source_activation_token_redemption_lock_id = ?)', [lockId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_elig_rl WHERE activation_token_redemption_unlock_eligibility_id IN (SELECT activation_token_redemption_unlock_eligibility_id FROM cb_cohort_intervention_activation_token_redempt_unlock_elig WHERE source_activation_token_redemption_lock_id = ?)', [lockId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_elig_aud WHERE activation_token_redemption_unlock_eligibility_id IN (SELECT activation_token_redemption_unlock_eligibility_id FROM cb_cohort_intervention_activation_token_redempt_unlock_elig WHERE source_activation_token_redemption_lock_id = ?)', [lockId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_elig WHERE source_activation_token_redemption_lock_id = ?', [lockId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_lock WHERE activation_token_redemption_lock_id = ?', [lockId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_fapv WHERE activation_token_redemption_final_apv_id = ?', [finalApvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_env WHERE activation_token_redemption_env_id = ?', [envId]);

    // 2. Setup final approval parent chain
    const createdEnv = await envBuilder.createTokenRedemptionEnvelopeDraft('ata_165b_1', 'admin');
    await envBuilder._internalUpdateTokenRedemptionEnvelope(createdEnv.tokenRedemptionEnvelope.activation_token_redemption_env_id, {
      activation_token_redemption_env_id: envId,
      activation_token_redemption_envelope_status: 'FINALIZED',
      activation_token_redemption_envelope_result: 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED',
      activation_token_redemption_envelope_hash: 'env_hash_165b'
    });

    const createdFApv = await finalApvBuilder.createTokenRedemptionFinalApprovalDraft(envId, 'admin');
    await finalApvBuilder._internalUpdateTokenRedemptionFinalApproval(createdFApv.tokenRedemptionFinalApproval.activation_token_redemption_final_apv_id, {
      activation_token_redemption_final_apv_id: finalApvId,
      activation_token_redemption_final_apv_status: 'FINALIZED',
      activation_token_redemption_final_apv_result: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
      activation_token_redemption_final_apv_hash: 'fapv_hash_165b'
    });

    // 3. Create, evaluate, approve, and finalize lock
    const draftLock = await lockBuilder.createTokenRedemptionLockDraft(finalApvId, 'admin');
    const tempLockId = draftLock.tokenRedemptionLock.activation_token_redemption_lock_id;

    await lockEvaluator.evaluateTokenRedemptionLock(tempLockId, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true,
      operations_director_confirmed: true
    }, 'admin');

    await lockDecisionSvc.recordDecision(tempLockId, 'APPROVE', 'Smoke 166 setup confirmation', 'admin');
    const finalizedLock = await lockDecisionSvc.finalizeRedemptionLock(tempLockId, 'admin');

    // Update ID to lockId
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_lock
       SET activation_token_redemption_lock_id = ?
       WHERE activation_token_redemption_lock_id = ?`,
      [lockId, tempLockId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_lock_ev
       SET activation_token_redemption_lock_id = ?
       WHERE activation_token_redemption_lock_id = ?`,
      [lockId, tempLockId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_lock_rules
       SET activation_token_redemption_lock_id = ?
       WHERE activation_token_redemption_lock_id = ?`,
      [lockId, tempLockId]
    );
  }
}

module.exports = {
  setupFinalizedRedemptionLock,
  isProdLike
};
