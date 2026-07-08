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

async function setupFinalizedUnlockEligibility(eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId) {
  const unlockEligBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService').serviceInstance;
  const unlockEligEvaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityEvaluatorService').serviceInstance;
  const unlockEligDecision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityDecisionService').serviceInstance;

  await setupFinalizedRedemptionLock(lockId, finalApvId, envId, authId, readinessId, issuanceId);

  if (!isProdLike) {
    unlockEligBuilder._mockState.tokenRedemptionUnlockEligibility.set(eligibilityId, {
      activation_token_redemption_unlock_eligibility_id: eligibilityId,
      source_activation_token_redemption_lock_id: lockId,
      source_activation_token_redemption_final_apv_id: finalApvId,
      source_activation_token_redemption_envelope_id: envId,
      source_activation_token_redemption_auth_id: authId,
      source_activation_token_redemption_readiness_id: readinessId,
      source_activation_token_issuance_id: issuanceId,
      source_activation_token_staging_id: 'stg_dummy',
      source_activation_token_preflight_id: 'pfl_dummy',
      source_plan_id: 'pln_dummy',
      source_dispatcher_id: 'dsp_dummy',
      source_envelope_id: 'env_dummy',
      source_auth_id: 'ath_dummy',
      source_readiness_id: 'rd_dummy',
      source_approval_id: 'apv_dummy',
      source_prep_id: 'prep_dummy',
      unlock_eligibility_status: 'FINALIZED',
      unlock_eligibility_result: 'UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED',
      token_redemption_lock_status: 'LOCKED_NOT_REDEEMED',
      token_redemption_status: 'LOCKED_NOT_REDEEMED',
      token_redeemable_status: 'NOT_REDEEMABLE',
      actual_unlock_status: 'NOT_UNLOCKED',
      risk_level: 'LOW',
      confidence_level: 'HIGH',
      projected_impact_score: 35.0,
      rollback_feasibility_score: 80.0,
      evidence_completeness_score: 95.0,
      guardrail_status: 'PASS',
      write_scope_status: 'PASS',
      canary_envelope_json: {},
      unlock_eligibility_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      unlock_eligibility_rules_json: {},
      unlock_eligibility_blockers_json: {},
      non_execution_attestation_json: { safe_workflow_boundary_preserved: true },
      write_scope_attestation_json: { writes_only_phase166_tables: true },
      source_redemption_lock_hash: 'lock_hash_dummy',
      source_redemption_package_freeze_hash: 'freeze_hash_dummy',
      source_token_material_hash: 'token_material_hash_dummy',
      unlock_eligibility_hash: 'elig_hash_dummy',
      unlock_eligibility_evidence_pack_hash: 'elig_ep_hash_dummy',
      evidence_pack_hash: 'elig_ep_hash_dummy',
      lineage_hash_chain_json: {
        phase166_unlock_eligibility: {
          activation_token_redemption_unlock_eligibility_id: eligibilityId,
          unlock_eligibility_status: 'FINALIZED',
          unlock_eligibility_result: 'UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED',
          unlock_eligibility_hash: 'elig_hash_dummy'
        },
        phase165_token_redemption_lock: {
          activation_token_redemption_lock_id: lockId,
          activation_token_redemption_lock_status: 'FINALIZED'
        }
      },
      security_signature_json: {},
      eligibility_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_ELIGIBILITY_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      created_by: 'admin',
      updated_by: 'admin'
    });
    unlockEligBuilder._mockState.rules.set(eligibilityId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_apv WHERE source_activation_token_redemption_unlock_eligibility_id = ?', [eligibilityId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_elig_ev WHERE activation_token_redemption_unlock_eligibility_id = ?', [eligibilityId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_elig_rl WHERE activation_token_redemption_unlock_eligibility_id = ?', [eligibilityId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_elig_aud WHERE activation_token_redemption_unlock_eligibility_id = ?', [eligibilityId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_elig WHERE activation_token_redemption_unlock_eligibility_id = ?', [eligibilityId]);

    const draft = await unlockEligBuilder.createTokenRedemptionUnlockEligibilityDraft(lockId, 'admin');
    const tempId = draft.tokenRedemptionUnlockEligibility.activation_token_redemption_unlock_eligibility_id;

    await unlockEligEvaluator.evaluateUnlockEligibility(tempId, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true
    }, 'admin');

    await unlockEligDecision.recordDecision(tempId, 'APPROVE', 'Smoke 167 setup approval', 'admin');
    await unlockEligDecision.finalizeUnlockEligibility(tempId, 'admin');

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_elig
       SET activation_token_redemption_unlock_eligibility_id = ?
       WHERE activation_token_redemption_unlock_eligibility_id = ?`,
      [eligibilityId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_elig_ev
       SET activation_token_redemption_unlock_eligibility_id = ?
       WHERE activation_token_redemption_unlock_eligibility_id = ?`,
      [eligibilityId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_elig_rl
       SET activation_token_redemption_unlock_eligibility_id = ?
       WHERE activation_token_redemption_unlock_eligibility_id = ?`,
      [eligibilityId, tempId]
    );
  }
}

async function setupFinalizedUnlockApproval(approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId) {
  await setupFinalizedUnlockEligibility(eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

  const unlockApvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalBuilderService').serviceInstance;
  const unlockApvEvaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalEvaluatorService').serviceInstance;
  const unlockApvDecision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalDecisionService').serviceInstance;

  if (!isProdLike) {
    unlockApvBuilder._mockState.tokenRedemptionUnlockApproval.set(approvalId, {
      activation_token_redemption_unlock_approval_id: approvalId,
      source_activation_token_redemption_unlock_eligibility_id: eligibilityId,
      source_activation_token_redemption_lock_id: lockId,
      source_activation_token_redemption_final_apv_id: finalApvId,
      source_activation_token_redemption_envelope_id: envId,
      source_activation_token_redemption_auth_id: authId,
      source_activation_token_redemption_readiness_id: readinessId,
      source_activation_token_issuance_id: issuanceId,
      source_activation_token_staging_id: 'mock_staging_id',
      source_activation_token_preflight_id: 'mock_preflight_id',
      source_plan_id: 'mock_plan_id',
      source_dispatcher_id: 'mock_dispatcher_id',
      source_envelope_id: 'mock_envelope_id',
      source_auth_id: 'mock_auth_id',
      source_readiness_id: 'mock_readiness_id',
      source_approval_id: 'mock_approval_id',
      source_prep_id: 'mock_prep_id',
      cohort_id: 'mock_cohort',
      tenant_id: 'mock_tenant',
      simulation_type: 'mock_sim',
      unlock_approval_status: 'FINALIZED',
      unlock_approval_result: 'UNLOCK_APPROVAL_PASSED_NOT_UNLOCKED',
      unlock_eligibility_status: 'UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED',
      token_redemption_lock_status: 'LOCKED_NOT_REDEEMED',
      token_redemption_status: 'LOCKED_NOT_REDEEMED',
      token_unlock_status: 'NOT_UNLOCKED',
      token_redeemable_status: 'NOT_REDEEMABLE',
      risk_level: 'LOW',
      confidence_level: 'HIGH',
      projected_impact_score: 0.1,
      rollback_feasibility_score: 0.9,
      evidence_completeness_score: 1.0,
      guardrail_status: 'PASSED',
      write_scope_status: 'PASSED',
      canary_envelope_json: {},
      unlock_approval_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      unlock_approval_rules_json: {},
      unlock_approval_blockers_json: {},
      non_execution_attestation_json: { safe_workflow_boundary_preserved: true },
      write_scope_attestation_json: { writes_only_phase167_tables: true },
      source_unlock_eligibility_hash: 'elig_hash_dummy',
      source_redemption_lock_hash: 'lock_hash_dummy',
      source_redemption_package_freeze_hash: 'freeze_hash_dummy',
      source_token_material_hash: 'token_material_hash_dummy',
      unlock_approval_hash: 'apv_hash_dummy',
      unlock_approval_evidence_pack_hash: 'apv_ep_hash_dummy',
      evidence_pack_hash: 'apv_ep_hash_dummy',
      lineage_hash_chain_json: {
        phase167_unlock_approval: 'apv_hash_dummy',
        phase166_unlock_eligibility: 'elig_hash_dummy',
        phase165_redemption_lock: 'lock_hash_dummy'
      },
      security_signature_json: {},
      approval_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_APPROVAL_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      created_by: 'admin',
      updated_by: 'admin'
    });
    unlockApvBuilder._mockState.rules.set(approvalId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_frev WHERE source_activation_token_redemption_unlock_approval_id = ?', [approvalId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_apv_ev WHERE activation_token_redemption_unlock_approval_id = ?', [approvalId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_apv_rl WHERE activation_token_redemption_unlock_approval_id = ?', [approvalId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_apv_aud WHERE activation_token_redemption_unlock_approval_id = ?', [approvalId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_apv WHERE activation_token_redemption_unlock_approval_id = ?', [approvalId]);

    const draft = await unlockApvBuilder.createTokenRedemptionUnlockApprovalDraft(eligibilityId, 'admin');
    const tempId = draft.tokenRedemptionUnlockApproval.activation_token_redemption_unlock_approval_id;

    await unlockApvEvaluator.evaluateUnlockApproval(tempId, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true
    }, 'admin');

    await unlockApvDecision.recordDecision(tempId, 'APPROVE', 'Smoke 168 setup approval', 'admin');
    await unlockApvDecision.finalizeUnlockApproval(tempId, 'admin');

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_apv
       SET activation_token_redemption_unlock_approval_id = ?
       WHERE activation_token_redemption_unlock_approval_id = ?`,
      [approvalId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_apv_ev
       SET activation_token_redemption_unlock_approval_id = ?
       WHERE activation_token_redemption_unlock_approval_id = ?`,
      [approvalId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_apv_rl
       SET activation_token_redemption_unlock_approval_id = ?
       WHERE activation_token_redemption_unlock_approval_id = ?`,
      [approvalId, tempId]
    );
  }
}

module.exports = {
  setupFinalizedRedemptionLock,
  setupFinalizedUnlockEligibility,
  setupFinalizedUnlockApproval,
  isProdLike
};
