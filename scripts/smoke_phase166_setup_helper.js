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

async function setupFinalizedUnlockFinalReview(finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId) {
  await setupFinalizedUnlockApproval(approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

  const unlockFrevBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewBuilderService').serviceInstance;
  const unlockFrevEvaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewEvaluatorService').serviceInstance;
  const unlockFrevDecision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewDecisionService').serviceInstance;

  if (!isProdLike) {
    unlockFrevBuilder._mockState.tokenRedemptionUnlockFinalReview.set(finalReviewId, {
      activation_token_redemption_unlock_final_review_id: finalReviewId,
      source_activation_token_redemption_unlock_approval_id: approvalId,
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
      unlock_final_review_status: 'FINALIZED',
      unlock_final_review_result: 'FINAL_REVIEW_PASSED_NOT_UNLOCKED',
      unlock_approval_status: 'FINALIZED',
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
      unlock_final_review_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      unlock_final_review_rules_json: {},
      unlock_final_review_blockers_json: {},
      non_execution_attestation_json: { safe_workflow_boundary_preserved: true },
      write_scope_attestation_json: { writes_only_phase168_tables: true },
      source_unlock_approval_hash: 'apv_hash_dummy',
      source_unlock_eligibility_hash: 'elig_hash_dummy',
      source_redemption_lock_hash: 'lock_hash_dummy',
      source_redemption_final_approval_hash: 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: 'freeze_hash_dummy',
      source_token_material_hash: 'token_material_hash_dummy',
      unlock_final_review_hash: 'frev_hash_dummy',
      unlock_final_review_evidence_pack_hash: 'frev_ep_hash_dummy',
      evidence_pack_hash: 'frev_ep_hash_dummy',
      lineage_hash_chain_json: {
        phase168_unlock_final_review: 'frev_hash_dummy',
        phase167_unlock_approval: 'apv_hash_dummy',
        phase166_unlock_eligibility: 'elig_hash_dummy'
      },
      security_signature_json: {},
      final_review_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_FINAL_REVIEW_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      created_by: 'admin',
      updated_by: 'admin'
    });
    unlockFrevBuilder._mockState.rules.set(finalReviewId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_seal WHERE source_activation_token_redemption_unlock_final_review_id = ?', [finalReviewId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_frev_ev WHERE activation_token_redemption_unlock_final_review_id = ?', [finalReviewId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_frev_rl WHERE activation_token_redemption_unlock_final_review_id = ?', [finalReviewId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_frev_aud WHERE activation_token_redemption_unlock_final_review_id = ?', [finalReviewId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_frev WHERE activation_token_redemption_unlock_final_review_id = ?', [finalReviewId]);

    const draft = await unlockFrevBuilder.createTokenRedemptionUnlockFinalReviewDraft(approvalId, 'admin');
    const tempId = draft.tokenRedemptionUnlockFinalReview.activation_token_redemption_unlock_final_review_id;

    await unlockFrevEvaluator.evaluateUnlockFinalReview(tempId, {
      security_officer_confirmation: true,
      compliance_officer_confirmation: true,
      operations_director_confirmation: true,
      rollback_authority_confirmation: true,
      kill_switch_confirmation: true,
      non_execution_confirmation: true,
      final_review_no_unlock_confirmation: true
    }, 'admin');

    await unlockFrevDecision.recordDecision(tempId, 'APPROVE_FINAL_REVIEW', 'Smoke 169 setup final review', 'admin');
    await unlockFrevDecision.finalizeUnlockFinalReview(tempId, 'admin');

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_frev
       SET activation_token_redemption_unlock_final_review_id = ?
       WHERE activation_token_redemption_unlock_final_review_id = ?`,
      [finalReviewId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_frev_ev
       SET activation_token_redemption_unlock_final_review_id = ?
       WHERE activation_token_redemption_unlock_final_review_id = ?`,
      [finalReviewId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_frev_rl
       SET activation_token_redemption_unlock_final_review_id = ?
       WHERE activation_token_redemption_unlock_final_review_id = ?`,
      [finalReviewId, tempId]
    );
  }
}

async function setupFinalizedUnlockSeal(unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId) {
  await setupFinalizedUnlockFinalReview(finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

  const unlockSealBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealBuilderService').serviceInstance;
  const unlockSealEvaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealEvaluatorService').serviceInstance;
  const unlockSealDecision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealDecisionService').serviceInstance;

  if (!isProdLike) {
    unlockSealBuilder._mockState.tokenRedemptionUnlockSeal.set(unlockSealId, {
      activation_token_redemption_unlock_seal_id: unlockSealId,
      source_activation_token_redemption_unlock_final_review_id: finalReviewId,
      source_activation_token_redemption_unlock_approval_id: approvalId,
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
      unlock_seal_status: 'FINALIZED',
      unlock_seal_result: 'UNLOCK_READINESS_SEALED_NOT_UNLOCKED',
      unlock_final_review_status: 'FINALIZED',
      unlock_approval_status: 'FINALIZED',
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
      unlock_seal_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      unlock_seal_rules_json: {},
      unlock_seal_blockers_json: {},
      non_execution_attestation_json: { safe_workflow_boundary_preserved: true },
      write_scope_attestation_json: { writes_only_phase169_tables: true },
      source_unlock_final_review_hash: 'frev_hash_dummy',
      source_unlock_approval_hash: 'apv_hash_dummy',
      source_unlock_eligibility_hash: 'elig_hash_dummy',
      source_redemption_lock_hash: 'lock_hash_dummy',
      source_redemption_final_approval_hash: 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: 'freeze_hash_dummy',
      source_token_material_hash: 'token_material_hash_dummy',
      unlock_seal_hash: 'seal_hash_dummy',
      unlock_seal_evidence_pack_hash: 'seal_ep_hash_dummy',
      evidence_pack_hash: 'seal_ep_hash_dummy',
      lineage_hash_chain_json: {
        phase169_unlock_readiness_seal: 'seal_hash_dummy',
        phase168_unlock_final_review: 'frev_hash_dummy',
        phase167_unlock_approval: 'apv_hash_dummy',
        phase166_unlock_eligibility: 'elig_hash_dummy'
      },
      security_signature_json: {},
      seal_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_READINESS_SEAL_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      created_by: 'admin',
      updated_by: 'admin'
    });
    unlockSealBuilder._mockState.rules.set(unlockSealId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_pfrz WHERE source_activation_token_redemption_unlock_seal_id = ?', [unlockSealId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_seal_ev WHERE activation_token_redemption_unlock_seal_id = ?', [unlockSealId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_seal_rl WHERE activation_token_redemption_unlock_seal_id = ?', [unlockSealId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_seal_aud WHERE activation_token_redemption_unlock_seal_id = ?', [unlockSealId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_seal WHERE activation_token_redemption_unlock_seal_id = ?', [unlockSealId]);

    const draft = await unlockSealBuilder.createTokenRedemptionUnlockSealDraft(finalReviewId, 'admin');
    const tempId = draft.tokenRedemptionUnlockSeal.activation_token_redemption_unlock_seal_id;

    await unlockSealEvaluator.evaluateUnlockSeal(tempId, {
      security_officer_confirmation: true,
      compliance_officer_confirmation: true,
      operations_director_confirmation: true,
      rollback_authority_confirmation: true,
      kill_switch_confirmation: true,
      non_execution_confirmation: true,
      final_review_unlock_readiness_confirmation: true,
      seal_authenticity_confirmation: true
    }, 'admin');

    await unlockSealDecision.recordDecision(tempId, 'APPROVE_SEAL', 'Smoke 170 setup seal', 'admin');
    await unlockSealDecision.finalizeUnlockSeal(tempId, 'admin');

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_seal
       SET activation_token_redemption_unlock_seal_id = ?
       WHERE activation_token_redemption_unlock_seal_id = ?`,
      [unlockSealId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_seal_ev
       SET activation_token_redemption_unlock_seal_id = ?
       WHERE activation_token_redemption_unlock_seal_id = ?`,
      [unlockSealId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_seal_rl
       SET activation_token_redemption_unlock_seal_id = ?
       WHERE activation_token_redemption_unlock_seal_id = ?`,
      [unlockSealId, tempId]
    );
  }
}

async function setupFinalizedUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId) {
  await setupFinalizedUnlockSeal(unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

  const unlockPreExecutionFreezeBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeBuilderService').serviceInstance;
  const unlockPreExecutionFreezeEvaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeEvaluatorService').serviceInstance;
  const unlockPreExecutionFreezeDecision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeDecisionService').serviceInstance;

  if (!isProdLike) {
    unlockPreExecutionFreezeBuilder._mockState.tokenRedemptionUnlockPreExecutionFreeze.set(unlockPreExecutionFreezeId, {
      activation_token_redemption_unlock_pre_execution_freeze_id: unlockPreExecutionFreezeId,
      source_activation_token_redemption_unlock_seal_id: unlockSealId,
      source_activation_token_redemption_unlock_final_review_id: finalReviewId,
      source_activation_token_redemption_unlock_approval_id: approvalId,
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
      unlock_pre_execution_freeze_status: 'FINALIZED',
      unlock_pre_execution_freeze_result: 'UNLOCK_PRE_EXECUTION_FROZEN_NOT_UNLOCKED',
      unlock_seal_status: 'FINALIZED',
      unlock_final_review_status: 'FINALIZED',
      unlock_approval_status: 'FINALIZED',
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
      unlock_pre_execution_freeze_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      unlock_pre_execution_freeze_rules_json: {},
      unlock_pre_execution_freeze_blockers_json: {},
      non_execution_attestation_json: { safe_workflow_boundary_preserved: true },
      write_scope_attestation_json: { writes_only_phase170_tables: true },
      source_unlock_seal_hash: 'seal_hash_dummy',
      source_unlock_final_review_hash: 'frev_hash_dummy',
      source_unlock_approval_hash: 'apv_hash_dummy',
      source_unlock_eligibility_hash: 'elig_hash_dummy',
      source_redemption_lock_hash: 'lock_hash_dummy',
      source_redemption_final_approval_hash: 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: 'freeze_hash_dummy',
      source_token_material_hash: 'token_material_hash_dummy',
      unlock_pre_execution_freeze_hash: 'pfrz_hash_dummy',
      unlock_pre_execution_freeze_evidence_pack_hash: 'pfrz_ep_hash_dummy',
      evidence_pack_hash: 'pfrz_ep_hash_dummy',
      lineage_hash_chain_json: {
        phase170_unlock_pre_execution_freeze: 'pfrz_hash_dummy',
        phase169_unlock_readiness_seal: 'seal_hash_dummy',
        phase168_unlock_final_review: 'frev_hash_dummy',
        phase167_unlock_approval: 'apv_hash_dummy',
        phase166_unlock_eligibility: 'elig_hash_dummy'
      },
      security_signature_json: {},
      freeze_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_PRE_EXECUTION_FREEZE_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      created_by: 'admin',
      updated_by: 'admin'
    });
    unlockPreExecutionFreezeBuilder._mockState.rules.set(unlockPreExecutionFreezeId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_oatt WHERE source_act_token_redempt_unlock_pre_execution_freeze_id = ?', [unlockPreExecutionFreezeId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_pfrz_ev WHERE activation_token_redemption_unlock_pre_execution_freeze_id = ?', [unlockPreExecutionFreezeId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_pfrz_rl WHERE activation_token_redemption_unlock_pre_execution_freeze_id = ?', [unlockPreExecutionFreezeId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_pfrz_aud WHERE activation_token_redemption_unlock_pre_execution_freeze_id = ?', [unlockPreExecutionFreezeId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_pfrz WHERE activation_token_redemption_unlock_pre_execution_freeze_id = ?', [unlockPreExecutionFreezeId]);

    const draft = await unlockPreExecutionFreezeBuilder.createTokenRedemptionUnlockPreExecutionFreezeDraft(unlockSealId, 'admin');
    const tempId = draft.tokenRedemptionUnlockPreExecutionFreeze.activation_token_redemption_unlock_pre_execution_freeze_id;

    await unlockPreExecutionFreezeEvaluator.evaluateUnlockPreExecutionFreeze(tempId, {
      security_officer_unlock_freeze_confirmation: true,
      compliance_officer_unlock_freeze_confirmation: true,
      operations_director_unlock_freeze_confirmation: true,
      rollback_authority_unlock_freeze_confirmation: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    }, 'admin');

    await unlockPreExecutionFreezeDecision.recordDecision(tempId, 'APPROVE_FREEZE', 'Smoke 171 setup freeze', 'admin');
    await unlockPreExecutionFreezeDecision.finalizeUnlockPreExecutionFreeze(tempId, 'admin');

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_pfrz
       SET activation_token_redemption_unlock_pre_execution_freeze_id = ?
       WHERE activation_token_redemption_unlock_pre_execution_freeze_id = ?`,
      [unlockPreExecutionFreezeId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_pfrz_ev
       SET activation_token_redemption_unlock_pre_execution_freeze_id = ?
       WHERE activation_token_redemption_unlock_pre_execution_freeze_id = ?`,
      [unlockPreExecutionFreezeId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_pfrz_rl
       SET activation_token_redemption_unlock_pre_execution_freeze_id = ?
       WHERE activation_token_redemption_unlock_pre_execution_freeze_id = ?`,
      [unlockPreExecutionFreezeId, tempId]
    );
  }
}

async function setupFinalizedUnlockOperatorAttestation(unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId) {
  await setupFinalizedUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

  const unlockOperatorAttestationBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationBuilderService').serviceInstance;
  const unlockOperatorAttestationEvaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationEvaluatorService').serviceInstance;
  const unlockOperatorAttestationDecision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationDecisionService').serviceInstance;

  if (!isProdLike) {
    unlockOperatorAttestationBuilder._mockState.tokenRedemptionUnlockOperatorAttestation.set(unlockOperatorAttestationId, {
      activation_token_redemption_unlock_operator_attestation_id: unlockOperatorAttestationId,
      source_act_token_redempt_unlock_pre_execution_freeze_id: unlockPreExecutionFreezeId,
      source_activation_token_redemption_unlock_seal_id: unlockSealId,
      source_activation_token_redemption_unlock_final_review_id: finalReviewId,
      source_activation_token_redemption_unlock_approval_id: approvalId,
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
      unlock_operator_attestation_status: 'FINALIZED',
      unlock_operator_attestation_result: 'OPERATOR_ATTESTED_NOT_UNLOCKED',
      unlock_pre_execution_freeze_status: 'FINALIZED',
      unlock_seal_status: 'FINALIZED',
      unlock_final_review_status: 'FINALIZED',
      unlock_approval_status: 'FINALIZED',
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
      unlock_operator_attestation_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      unlock_operator_attestation_rules_json: {},
      unlock_operator_attestation_blockers_json: {},
      non_execution_attestation_json: { safe_workflow_boundary_preserved: true },
      write_scope_attestation_json: { writes_only_phase171_tables: true },
      source_unlock_pre_execution_freeze_hash: 'pfrz_hash_dummy',
      source_unlock_seal_hash: 'seal_hash_dummy',
      source_unlock_final_review_hash: 'frev_hash_dummy',
      source_unlock_approval_hash: 'apv_hash_dummy',
      source_unlock_eligibility_hash: 'elig_hash_dummy',
      source_redemption_lock_hash: 'lock_hash_dummy',
      source_redemption_final_approval_hash: 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: 'freeze_hash_dummy',
      source_token_material_hash: 'token_material_hash_dummy',
      unlock_operator_attestation_hash: 'oatt_hash_dummy',
      unlock_operator_attestation_evidence_pack_hash: 'oatt_ep_hash_dummy',
      evidence_pack_hash: 'oatt_ep_hash_dummy',
      lineage_hash_chain_json: {
        phase171_unlock_operator_attestation: 'oatt_hash_dummy',
        phase170_unlock_pre_execution_freeze: 'pfrz_hash_dummy',
        phase169_unlock_readiness_seal: 'seal_hash_dummy',
        phase168_unlock_final_review: 'frev_hash_dummy',
        phase167_unlock_approval: 'apv_hash_dummy',
        phase166_unlock_eligibility: 'elig_hash_dummy'
      },
      security_signature_json: {},
      attestation_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_OPERATOR_ATTESTATION_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      created_by: 'admin',
      updated_by: 'admin'
    });
    unlockOperatorAttestationBuilder._mockState.rules.set(unlockOperatorAttestationId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_dcau WHERE source_act_token_redempt_unlock_operator_attestation_id = ?', [unlockOperatorAttestationId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_oatt_ev WHERE activation_token_redemption_unlock_operator_attestation_id = ?', [unlockOperatorAttestationId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_oatt_rl WHERE activation_token_redemption_unlock_operator_attestation_id = ?', [unlockOperatorAttestationId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_oatt_aud WHERE activation_token_redemption_unlock_operator_attestation_id = ?', [unlockOperatorAttestationId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_oatt WHERE activation_token_redemption_unlock_operator_attestation_id = ?', [unlockOperatorAttestationId]);

    const draft = await unlockOperatorAttestationBuilder.createTokenRedemptionUnlockOperatorAttestationDraft(unlockPreExecutionFreezeId, 'admin');
    const tempId = draft.tokenRedemptionUnlockOperatorAttestation.activation_token_redemption_unlock_operator_attestation_id;

    await unlockOperatorAttestationEvaluator.evaluateUnlockOperatorAttestation(tempId, {
      security_officer_unlock_attestation_confirmation: true,
      compliance_officer_unlock_attestation_confirmation: true,
      operations_director_unlock_attestation_confirmation: true,
      rollback_authority_unlock_attestation_confirmation: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true,
      operator_attestation_confirmed: true
    }, 'admin');

    await unlockOperatorAttestationDecision.recordDecision(tempId, 'APPROVE_ATTESTATION', 'Smoke 172 setup attestation', 'admin');
    await unlockOperatorAttestationDecision.finalizeUnlockOperatorAttestation(tempId, 'admin');

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_oatt
       SET activation_token_redemption_unlock_operator_attestation_id = ?
       WHERE activation_token_redemption_unlock_operator_attestation_id = ?`,
      [unlockOperatorAttestationId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_oatt_ev
       SET activation_token_redemption_unlock_operator_attestation_id = ?
       WHERE activation_token_redemption_unlock_operator_attestation_id = ?`,
      [unlockOperatorAttestationId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_oatt_rl
       SET activation_token_redemption_unlock_operator_attestation_id = ?
       WHERE activation_token_redemption_unlock_operator_attestation_id = ?`,
      [unlockOperatorAttestationId, tempId]
    );
  }
}

async function setupFinalizedUnlockDualControlAuthorization(unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId) {
  await setupFinalizedUnlockOperatorAttestation(unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

  const unlockDualControlAuthorizationBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationBuilderService').serviceInstance;
  const unlockDualControlAuthorizationEvaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationEvaluatorService').serviceInstance;
  const unlockDualControlAuthorizationDecision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationDecisionService').serviceInstance;

  if (!isProdLike) {
    unlockDualControlAuthorizationBuilder._mockState.tokenRedemptionUnlockDualControlAuthorization.set(unlockDualControlAuthorizationId, {
      activation_token_redemption_unlock_dual_control_authorization_id: unlockDualControlAuthorizationId,
      source_act_token_redempt_unlock_operator_attestation_id: unlockOperatorAttestationId,
      source_act_token_redempt_unlock_pre_execution_freeze_id: unlockPreExecutionFreezeId,
      source_activation_token_redemption_unlock_seal_id: unlockSealId,
      source_activation_token_redemption_unlock_final_review_id: finalReviewId,
      source_activation_token_redemption_unlock_approval_id: approvalId,
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
      unlock_dual_control_authorization_status: 'FINALIZED',
      unlock_dual_control_authorization_result: 'DUAL_CONTROL_AUTHORIZED_NOT_UNLOCKED',
      unlock_operator_attestation_status: 'FINALIZED',
      unlock_pre_execution_freeze_status: 'FINALIZED',
      unlock_seal_status: 'FINALIZED',
      unlock_final_review_status: 'FINALIZED',
      unlock_approval_status: 'FINALIZED',
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
      unlock_dual_control_authorization_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      unlock_dual_control_authorization_rules_json: {},
      unlock_dual_control_authorization_blockers_json: {},
      non_execution_attestation_json: { safe_workflow_boundary_preserved: true },
      write_scope_attestation_json: { writes_only_phase172_tables: true },
      source_unlock_operator_attestation_hash: 'oatt_hash_dummy',
      source_unlock_pre_execution_freeze_hash: 'pfrz_hash_dummy',
      source_unlock_seal_hash: 'seal_hash_dummy',
      source_unlock_final_review_hash: 'frev_hash_dummy',
      source_unlock_approval_hash: 'apv_hash_dummy',
      source_unlock_eligibility_hash: 'elig_hash_dummy',
      source_redemption_lock_hash: 'lock_hash_dummy',
      source_redemption_final_approval_hash: 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: 'freeze_hash_dummy',
      source_token_material_hash: 'token_material_hash_dummy',
      unlock_dual_control_authorization_hash: 'dcau_hash_dummy',
      unlock_dual_control_authorization_evidence_pack_hash: 'dcau_ep_hash_dummy',
      evidence_pack_hash: 'dcau_ep_hash_dummy',
      lineage_hash_chain_json: {
        phase172_unlock_dual_control_authorization: 'dcau_hash_dummy',
        phase171_unlock_operator_attestation: 'oatt_hash_dummy',
        phase170_unlock_pre_execution_freeze: 'pfrz_hash_dummy',
        phase169_unlock_readiness_seal: 'seal_hash_dummy',
        phase168_unlock_final_review: 'frev_hash_dummy',
        phase167_unlock_approval: 'apv_hash_dummy',
        phase166_unlock_eligibility: 'elig_hash_dummy'
      },
      security_signature_json: {},
      attestation_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_DUAL_CONTROL_AUTHORIZATION_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      primary_authorizer_id: 'dummy_alice',
      secondary_authorizer_id: 'dummy_bob',
      created_by: 'admin',
      updated_by: 'admin'
    });
    unlockDualControlAuthorizationBuilder._mockState.rules.set(unlockDualControlAuthorizationId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_fhas WHERE source_act_token_redempt_unlock_dual_control_authorization_id = ?', [unlockDualControlAuthorizationId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_dcau_ev WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?', [unlockDualControlAuthorizationId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_dcau_rl WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?', [unlockDualControlAuthorizationId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_dcau_aud WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?', [unlockDualControlAuthorizationId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_dcau WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?', [unlockDualControlAuthorizationId]);

    const draft = await unlockDualControlAuthorizationBuilder.createTokenRedemptionUnlockDualControlAuthorizationDraft(unlockOperatorAttestationId, 'admin');
    const tempId = draft.tokenRedemptionUnlockDualControlAuthorization.activation_token_redemption_unlock_dual_control_authorization_id;

    await unlockDualControlAuthorizationDecision.recordPrimaryAuthorizer(tempId, 'dummy_alice', 'operations_director');
    await unlockDualControlAuthorizationDecision.recordSecondaryAuthorizer(tempId, 'dummy_bob', 'compliance_officer');

    await unlockDualControlAuthorizationEvaluator.evaluateUnlockDualControlAuthorization(tempId, {
      primary_authorizer_unlock_authorization_confirmation: true,
      secondary_authorizer_unlock_authorization_confirmation: true,
      security_officer_unlock_attestation_verified: true,
      compliance_officer_unlock_attestation_verified: true,
      operations_director_unlock_attestation_verified: true,
      rollback_authority_unlock_attestation_verified: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    }, 'admin');

    await unlockDualControlAuthorizationDecision.recordDecision(tempId, 'APPROVE_DUAL_CONTROL', 'Smoke 173 setup dual control', 'admin');
    await unlockDualControlAuthorizationDecision.finalizeUnlockDualControlAuthorization(tempId, 'admin');

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_dcau
       SET activation_token_redemption_unlock_dual_control_authorization_id = ?
       WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?`,
      [unlockDualControlAuthorizationId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_dcau_ev
       SET activation_token_redemption_unlock_dual_control_authorization_id = ?
       WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?`,
      [unlockDualControlAuthorizationId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_dcau_rl
       SET activation_token_redemption_unlock_dual_control_authorization_id = ?
       WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?`,
      [unlockDualControlAuthorizationId, tempId]
    );
  }
}

async function setupFinalizedUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId) {
  await setupFinalizedUnlockDualControlAuthorization(unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

  const unlockFinalHumanAuthorizationSealBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealBuilderService').serviceInstance;
  const unlockFinalHumanAuthorizationSealEvaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealEvaluatorService').serviceInstance;
  const unlockFinalHumanAuthorizationSealDecision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealDecisionService').serviceInstance;

  if (!isProdLike) {
    unlockFinalHumanAuthorizationSealBuilder._mockState.tokenRedemptionUnlockFinalHumanAuthorizationSeal.set(unlockFinalHumanAuthorizationSealId, {
      act_token_redempt_unlock_final_human_authorization_seal_id: unlockFinalHumanAuthorizationSealId,
      source_act_token_redempt_unlock_dual_control_authorization_id: unlockDualControlAuthorizationId,
      source_act_token_redempt_unlock_operator_attestation_id: unlockOperatorAttestationId,
      source_act_token_redempt_unlock_pre_execution_freeze_id: unlockPreExecutionFreezeId,
      source_activation_token_redemption_unlock_seal_id: unlockSealId,
      source_activation_token_redemption_unlock_final_review_id: finalReviewId,
      source_activation_token_redemption_unlock_approval_id: approvalId,
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
      unlock_final_human_authorization_seal_status: 'FINALIZED',
      unlock_final_human_authorization_seal_result: 'FINAL_HUMAN_AUTHORIZATION_SEALED_NOT_UNLOCKED',
      unlock_final_human_authorization_seal_mode: 'FINAL_HUMAN_SEAL_ONLY',
      unlock_dual_control_authorization_status: 'FINALIZED',
      unlock_operator_attestation_status: 'FINALIZED',
      unlock_pre_execution_freeze_status: 'FINALIZED',
      unlock_seal_status: 'FINALIZED',
      unlock_final_review_status: 'FINALIZED',
      unlock_approval_status: 'FINALIZED',
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
      unlock_final_human_authorization_seal_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      unlock_final_human_authorization_seal_rules_json: {},
      unlock_final_human_authorization_seal_blockers_json: {},
      non_execution_attestation_json: { safe_workflow_boundary_preserved: true },
      write_scope_attestation_json: { writes_only_phase173_tables: true },
      source_unlock_dual_control_authorization_hash: 'dcau_hash_dummy',
      source_unlock_operator_attestation_hash: 'oatt_hash_dummy',
      source_unlock_pre_execution_freeze_hash: 'pfrz_hash_dummy',
      source_unlock_seal_hash: 'seal_hash_dummy',
      source_unlock_final_review_hash: 'frev_hash_dummy',
      source_unlock_approval_hash: 'apv_hash_dummy',
      source_unlock_eligibility_hash: 'elig_hash_dummy',
      source_redemption_lock_hash: 'lock_hash_dummy',
      source_redemption_final_approval_hash: 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: 'freeze_hash_dummy',
      source_token_material_hash: 'token_material_hash_dummy',
      unlock_final_human_authorization_seal_hash: 'fhas_hash_dummy',
      unlock_final_human_authorization_seal_evidence_pack_hash: 'fhas_ep_hash_dummy',
      evidence_pack_hash: 'fhas_ep_hash_dummy',
      lineage_hash_chain_json: {
        phase173_unlock_final_human_authorization_seal: 'fhas_hash_dummy',
        phase172_unlock_dual_control_authorization: 'dcau_hash_dummy',
        phase171_unlock_operator_attestation: 'oatt_hash_dummy',
        phase170_unlock_pre_execution_freeze: 'pfrz_hash_dummy',
        phase169_unlock_readiness_seal: 'seal_hash_dummy',
        phase168_unlock_final_review: 'frev_hash_dummy',
        phase167_unlock_approval: 'apv_hash_dummy',
        phase166_unlock_eligibility: 'elig_hash_dummy'
      },
      security_signature_json: {},
      attestation_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_FINAL_HUMAN_AUTHORIZATION_SEAL_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      primary_authorizer_id: 'dummy_alice',
      secondary_authorizer_id: 'dummy_bob',
      final_human_authorizer_id: 'dummy_charlie',
      created_by: 'admin',
      updated_by: 'admin'
    });
    unlockFinalHumanAuthorizationSealBuilder._mockState.rules.set(unlockFinalHumanAuthorizationSealId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_cwn WHERE source_act_token_redempt_unlock_final_human_auth_seal_id = ?', [unlockFinalHumanAuthorizationSealId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_fhas_ev WHERE act_token_redempt_unlock_final_human_authorization_seal_id = ?', [unlockFinalHumanAuthorizationSealId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_fhas_rl WHERE act_token_redempt_unlock_final_human_authorization_seal_id = ?', [unlockFinalHumanAuthorizationSealId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_fhas_aud WHERE act_token_redempt_unlock_final_human_authorization_seal_id = ?', [unlockFinalHumanAuthorizationSealId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_fhas WHERE act_token_redempt_unlock_final_human_authorization_seal_id = ?', [unlockFinalHumanAuthorizationSealId]);

    const draft = await unlockFinalHumanAuthorizationSealBuilder.createTokenRedemptionUnlockFinalHumanAuthorizationSealDraft(unlockDualControlAuthorizationId, 'admin');
    const tempId = draft.tokenRedemptionUnlockFinalHumanAuthorizationSeal.act_token_redempt_unlock_final_human_authorization_seal_id;

    await unlockFinalHumanAuthorizationSealDecision.recordFinalHumanAuthorizer(tempId, 'dummy_charlie', 'system_admin', 'Smoke 174 setup final human seal');

    await unlockFinalHumanAuthorizationSealEvaluator.evaluateUnlockFinalHumanAuthorizationSeal(tempId, {
      final_human_seal_authorizer_unlock_authorization_seal_confirmation: true,
      primary_authorizer_unlock_authorization_verified: true,
      secondary_authorizer_unlock_authorization_verified: true,
      security_officer_unlock_attestation_verified: true,
      compliance_officer_unlock_attestation_verified: true,
      operations_director_unlock_attestation_verified: true,
      rollback_authority_unlock_attestation_verified: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    }, 'admin');

    await unlockFinalHumanAuthorizationSealDecision.recordDecision(tempId, 'APPROVE_FINAL_SEAL', 'Approved final human seal for setup', 'admin');

    await unlockFinalHumanAuthorizationSealDecision.finalizeUnlockFinalHumanAuthorizationSeal(tempId, 'admin');

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_fhas
       SET act_token_redempt_unlock_final_human_authorization_seal_id = ?
       WHERE act_token_redempt_unlock_final_human_authorization_seal_id = ?`,
      [unlockFinalHumanAuthorizationSealId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_fhas_ev
       SET act_token_redempt_unlock_final_human_authorization_seal_id = ?
       WHERE act_token_redempt_unlock_final_human_authorization_seal_id = ?`,
      [unlockFinalHumanAuthorizationSealId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_fhas_rl
       SET act_token_redempt_unlock_final_human_authorization_seal_id = ?
       WHERE act_token_redempt_unlock_final_human_authorization_seal_id = ?`,
      [unlockFinalHumanAuthorizationSealId, tempId]
    );
  }
}

async function setupFinalizedUnlockComplianceWitness(unlockComplianceWitnessId, unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId) {
  await setupFinalizedUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

  const unlockComplianceWitnessBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessBuilderService').serviceInstance;
  const unlockComplianceWitnessEvaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessEvaluatorService').serviceInstance;
  const unlockComplianceWitnessDecision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessDecisionService').serviceInstance;

  if (!isProdLike) {
    unlockComplianceWitnessBuilder._mockState.tokenRedemptionUnlockComplianceWitness.set(unlockComplianceWitnessId, {
      act_token_redempt_unlock_compliance_witness_id: unlockComplianceWitnessId,
      source_act_token_redempt_unlock_final_human_auth_seal_id: unlockFinalHumanAuthorizationSealId,
      source_act_token_redempt_unlock_dual_control_authorization_id: unlockDualControlAuthorizationId,
      source_act_token_redempt_unlock_operator_attestation_id: unlockOperatorAttestationId,
      source_act_token_redempt_unlock_pre_execution_freeze_id: unlockPreExecutionFreezeId,
      source_activation_token_redemption_unlock_seal_id: unlockSealId,
      source_activation_token_redemption_unlock_final_review_id: finalReviewId,
      source_activation_token_redemption_unlock_approval_id: approvalId,
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
      unlock_compliance_witness_status: 'FINALIZED',
      unlock_compliance_witness_result: 'COMPLIANCE_WITNESSED_NOT_UNLOCKED',
      unlock_compliance_witness_mode: 'COMPLIANCE_WITNESS_ONLY',
      unlock_final_human_authorization_seal_status: 'FINALIZED',
      unlock_dual_control_authorization_status: 'FINALIZED',
      unlock_operator_attestation_status: 'FINALIZED',
      unlock_pre_execution_freeze_status: 'FINALIZED',
      unlock_seal_status: 'FINALIZED',
      unlock_final_review_status: 'FINALIZED',
      unlock_approval_status: 'FINALIZED',
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
      unlock_compliance_witness_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      unlock_compliance_witness_rules_json: {},
      unlock_compliance_witness_blockers_json: {},
      non_execution_attestation_json: { safe_workflow_boundary_preserved: true },
      write_scope_attestation_json: { writes_only_phase174_tables: true },
      source_unlock_final_human_authorization_seal_hash: 'fhas_hash_dummy',
      source_unlock_dual_control_authorization_hash: 'dcau_hash_dummy',
      source_unlock_operator_attestation_hash: 'oatt_hash_dummy',
      source_unlock_pre_execution_freeze_hash: 'pfrz_hash_dummy',
      source_unlock_seal_hash: 'seal_hash_dummy',
      source_unlock_final_review_hash: 'frev_hash_dummy',
      source_unlock_approval_hash: 'apv_hash_dummy',
      source_unlock_eligibility_hash: 'elig_hash_dummy',
      source_redemption_lock_hash: 'lock_hash_dummy',
      source_redemption_final_approval_hash: 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: 'freeze_hash_dummy',
      source_token_material_hash: 'token_material_hash_dummy',
      unlock_compliance_witness_hash: 'cwn_hash_dummy',
      unlock_compliance_witness_evidence_pack_hash: 'cwn_ep_hash_dummy',
      evidence_pack_hash: 'cwn_ep_hash_dummy',
      lineage_hash_chain_json: {
        phase174_unlock_compliance_witness: 'cwn_hash_dummy',
        phase173_unlock_final_human_authorization_seal: 'fhas_hash_dummy',
        phase172_unlock_dual_control_authorization: 'dcau_hash_dummy',
        phase171_unlock_operator_attestation: 'oatt_hash_dummy',
        phase170_unlock_pre_execution_freeze: 'pfrz_hash_dummy',
        phase169_unlock_readiness_seal: 'seal_hash_dummy',
        phase168_unlock_final_review: 'frev_hash_dummy',
        phase167_unlock_approval: 'apv_hash_dummy',
        phase166_unlock_eligibility: 'elig_hash_dummy'
      },
      security_signature_json: {},
      attestation_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_COMPLIANCE_WITNESS_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      primary_authorizer_id: 'dummy_alice',
      secondary_authorizer_id: 'dummy_bob',
      final_human_authorizer_id: 'dummy_charlie',
      compliance_witness_id: 'dummy_diana',
      created_by: 'admin',
      updated_by: 'admin'
    });
    unlockComplianceWitnessBuilder._mockState.rules.set(unlockComplianceWitnessId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_roc WHERE source_act_token_redempt_unlock_compliance_witness_id = ?', [unlockComplianceWitnessId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_cwn_ev WHERE act_token_redempt_unlock_compliance_witness_id = ?', [unlockComplianceWitnessId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_cwn_rl WHERE act_token_redempt_unlock_compliance_witness_id = ?', [unlockComplianceWitnessId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_cwn_aud WHERE act_token_redempt_unlock_compliance_witness_id = ?', [unlockComplianceWitnessId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_cwn WHERE act_token_redempt_unlock_compliance_witness_id = ?', [unlockComplianceWitnessId]);

    const draft = await unlockComplianceWitnessBuilder.createTokenRedemptionUnlockComplianceWitnessDraft(unlockFinalHumanAuthorizationSealId, 'admin');
    const tempId = draft.tokenRedemptionUnlockComplianceWitness.act_token_redempt_unlock_compliance_witness_id;

    await unlockComplianceWitnessDecision.recordComplianceWitness(tempId, 'dummy_diana', 'compliance_officer', 'Smoke 175 setup compliance witness', 'admin');

    await unlockComplianceWitnessEvaluator.evaluateUnlockComplianceWitness(tempId, {
      compliance_witness_attestation_confirmation: true,
      final_human_seal_authorizer_unlock_seal_verified: true,
      primary_authorizer_unlock_authorization_verified: true,
      secondary_authorizer_unlock_authorization_verified: true,
      security_officer_unlock_attestation_verified: true,
      compliance_officer_unlock_attestation_verified: true,
      operations_director_unlock_attestation_verified: true,
      rollback_authority_unlock_attestation_verified: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    }, 'admin');

    await unlockComplianceWitnessDecision.recordDecision(tempId, {
      compliance_witness_id: 'dummy_diana',
      compliance_witness_role: 'compliance_officer',
      compliance_witness_reason: 'Smoke 175 setup compliance witness decision',
      decision: 'APPROVE_COMPLIANCE_WITNESS',
      rationale: 'Approved compliance witness for setup'
    }, 'admin');

    await unlockComplianceWitnessDecision.finalizeUnlockComplianceWitness(tempId, 'admin');

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_cwn
       SET act_token_redempt_unlock_compliance_witness_id = ?
       WHERE act_token_redempt_unlock_compliance_witness_id = ?`,
      [unlockComplianceWitnessId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_cwn_ev
       SET act_token_redempt_unlock_compliance_witness_id = ?
       WHERE act_token_redempt_unlock_compliance_witness_id = ?`,
      [unlockComplianceWitnessId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_cwn_rl
       SET act_token_redempt_unlock_compliance_witness_id = ?
       WHERE act_token_redempt_unlock_compliance_witness_id = ?`,
      [unlockComplianceWitnessId, tempId]
    );
  }
}

async function setupFinalizedUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId, unlockComplianceWitnessId, unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId) {
  const rocBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignBuilderService').serviceInstance;
  const rocEvaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignEvaluatorService').serviceInstance;
  const rocDecision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignDecisionService').serviceInstance;

  await setupFinalizedUnlockComplianceWitness(unlockComplianceWitnessId, unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

  if (!isProdLike) {
    rocBuilder._mockState.tokenRedemptionUnlockRiskOfficerCountersign.set(unlockRiskOfficerCountersignId, {
      act_token_redempt_unlock_risk_officer_countersign_id: unlockRiskOfficerCountersignId,
      source_act_token_redempt_unlock_compliance_witness_id: unlockComplianceWitnessId,
      source_act_token_redempt_unlock_final_human_auth_seal_id: unlockFinalHumanAuthorizationSealId,
      source_act_token_redempt_unlock_dual_control_authorization_id: unlockDualControlAuthorizationId,
      source_act_token_redempt_unlock_operator_attestation_id: unlockOperatorAttestationId,
      source_act_token_redempt_unlock_pre_execution_freeze_id: unlockPreExecutionFreezeId,
      source_activation_token_redemption_unlock_seal_id: unlockSealId,
      source_activation_token_redemption_unlock_final_review_id: finalReviewId,
      source_activation_token_redemption_unlock_approval_id: approvalId,
      source_activation_token_redemption_unlock_eligibility_id: eligibilityId,
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
      unlock_risk_officer_countersign_status: 'FINALIZED',
      unlock_risk_officer_countersign_result: 'RISK_OFFICER_COUNTERSIGNED_NOT_UNLOCKED',
      unlock_risk_officer_countersign_mode: 'RISK_OFFICER_COUNTERSIGN_ONLY',
      unlock_compliance_witness_status: 'FINALIZED',
      unlock_final_human_authorization_seal_status: 'FINALIZED',
      unlock_dual_control_authorization_status: 'FINALIZED',
      unlock_operator_attestation_status: 'FINALIZED',
      unlock_pre_execution_freeze_status: 'FINALIZED',
      unlock_seal_status: 'FINALIZED',
      unlock_final_review_status: 'FINALIZED',
      unlock_approval_status: 'FINALIZED',
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
      unlock_risk_officer_countersign_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      unlock_risk_officer_countersign_rules_json: {},
      unlock_risk_officer_countersign_blockers_json: {},
      non_execution_attestation_json: {},
      write_scope_attestation_json: {},
      source_unlock_compliance_witness_hash: 'cwn_hash_dummy',
      source_unlock_final_human_authorization_seal_hash: 'fhas_hash_dummy',
      source_unlock_dual_control_authorization_hash: 'dcau_hash_dummy',
      source_unlock_operator_attestation_hash: 'oatt_hash_dummy',
      source_unlock_pre_execution_freeze_hash: 'freeze_hash_dummy',
      source_unlock_seal_hash: 'seal_hash_dummy',
      source_unlock_final_review_hash: 'frev_hash_dummy',
      source_unlock_approval_hash: 'apv_hash_dummy',
      source_unlock_eligibility_hash: 'elig_hash_dummy',
      source_redemption_lock_hash: 'lock_hash_dummy',
      source_redemption_final_approval_hash: 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: 'freeze_hash_dummy',
      source_token_material_hash: 'token_material_hash_dummy',
      unlock_risk_officer_countersign_hash: 'roc_hash_dummy',
      unlock_risk_officer_countersign_evidence_pack_hash: 'roc_ep_hash_dummy',
      evidence_pack_hash: 'roc_ep_hash_dummy',
      lineage_hash_chain_json: {
        phase175_unlock_risk_officer_countersign: 'roc_hash_dummy',
        phase174_unlock_compliance_witness: 'cwn_hash_dummy',
        phase173_unlock_final_human_authorization_seal: 'fhas_hash_dummy',
        phase172_unlock_dual_control_authorization: 'dcau_hash_dummy',
        phase171_unlock_operator_attestation: 'oatt_hash_dummy',
        phase170_unlock_pre_execution_freeze: 'freeze_hash_dummy',
        phase169_unlock_readiness_seal: 'seal_hash_dummy',
        phase168_unlock_final_review: 'frev_hash_dummy',
        phase167_unlock_approval: 'apv_hash_dummy',
        phase166_unlock_eligibility: 'elig_hash_dummy'
      },
      security_signature_json: {},
      attestation_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_RISK_OFFICER_COUNTERSIGN_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      primary_authorizer_id: 'dummy_alice',
      secondary_authorizer_id: 'dummy_bob',
      final_human_authorizer_id: 'dummy_charlie',
      compliance_witness_id: 'dummy_diana',
      risk_officer_id: 'dummy_elena',
      created_by: 'admin',
      updated_by: 'admin'
    });
    rocBuilder._mockState.rules.set(unlockRiskOfficerCountersignId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_lph WHERE source_act_token_redempt_unlock_risk_officer_countersign_id = ?', [unlockRiskOfficerCountersignId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_roc_ev WHERE act_token_redempt_unlock_risk_officer_countersign_id = ?', [unlockRiskOfficerCountersignId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_roc_rl WHERE act_token_redempt_unlock_risk_officer_countersign_id = ?', [unlockRiskOfficerCountersignId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_roc_aud WHERE act_token_redempt_unlock_risk_officer_countersign_id = ?', [unlockRiskOfficerCountersignId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_roc WHERE act_token_redempt_unlock_risk_officer_countersign_id = ?', [unlockRiskOfficerCountersignId]);

    const draft = await rocBuilder.createTokenRedemptionUnlockRiskOfficerCountersignDraft(unlockComplianceWitnessId, 'admin');
    const tempId = draft.tokenRedemptionUnlockRiskOfficerCountersign.act_token_redempt_unlock_risk_officer_countersign_id;

    await rocDecision.recordRiskOfficer(tempId, 'dummy_elena', 'risk_officer', 'Smoke 176 setup risk officer countersign', 'admin');

    await rocEvaluator.evaluateUnlockRiskOfficerCountersign(tempId, {
      risk_officer_countersign_confirmation: true,
      compliance_witness_attestation_verified: true,
      final_human_seal_authorizer_unlock_seal_verified: true,
      primary_authorizer_unlock_authorization_verified: true,
      secondary_authorizer_unlock_authorization_verified: true,
      security_officer_unlock_attestation_verified: true,
      compliance_officer_unlock_attestation_verified: true,
      operations_director_unlock_attestation_verified: true,
      rollback_authority_unlock_attestation_verified: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    }, 'admin');

    await rocDecision.recordDecision(tempId, 'APPROVE_RISK_COUNTERSIGN', 'Approved for setup', 'admin');
    await rocDecision.finalizeUnlockRiskOfficerCountersign(tempId, 'admin');

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_roc
       SET act_token_redempt_unlock_risk_officer_countersign_id = ?
       WHERE act_token_redempt_unlock_risk_officer_countersign_id = ?`,
      [unlockRiskOfficerCountersignId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_roc_ev
       SET act_token_redempt_unlock_risk_officer_countersign_id = ?
       WHERE act_token_redempt_unlock_risk_officer_countersign_id = ?`,
      [unlockRiskOfficerCountersignId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_roc_rl
       SET act_token_redempt_unlock_risk_officer_countersign_id = ?
       WHERE act_token_redempt_unlock_risk_officer_countersign_id = ?`,
      [unlockRiskOfficerCountersignId, tempId]
    );
  }
}

async function setupFinalizedUnlockLegalPolicyHold(unlockLegalPolicyHoldId, unlockRiskOfficerCountersignId, unlockComplianceWitnessId, unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId) {
  const lphBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldBuilderService').serviceInstance;
  const lphEvaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldEvaluatorService').serviceInstance;
  const lphDecision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldDecisionService').serviceInstance;

  await setupFinalizedUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId, unlockComplianceWitnessId, unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

  if (!isProdLike) {
    lphBuilder._mockState.tokenRedemptionUnlockLegalPolicyHold.set(unlockLegalPolicyHoldId, {
      act_token_redempt_unlock_legal_policy_hold_id: unlockLegalPolicyHoldId,
      source_act_token_redempt_unlock_risk_officer_countersign_id: unlockRiskOfficerCountersignId,
      source_act_token_redempt_unlock_compliance_witness_id: unlockComplianceWitnessId,
      source_act_token_redempt_unlock_final_human_auth_seal_id: unlockFinalHumanAuthorizationSealId,
      source_act_token_redempt_unlock_dual_control_authorization_id: unlockDualControlAuthorizationId,
      source_act_token_redempt_unlock_operator_attestation_id: unlockOperatorAttestationId,
      source_act_token_redempt_unlock_pre_execution_freeze_id: unlockPreExecutionFreezeId,
      source_activation_token_redemption_unlock_seal_id: unlockSealId,
      source_activation_token_redemption_unlock_final_review_id: finalReviewId,
      source_activation_token_redemption_unlock_approval_id: approvalId,
      source_activation_token_redemption_unlock_eligibility_id: eligibilityId,
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
      unlock_legal_policy_hold_status: 'FINALIZED',
      unlock_legal_policy_hold_result: 'LEGAL_POLICY_HOLD_CLEARED_NOT_UNLOCKED',
      unlock_legal_policy_hold_mode: 'LEGAL_POLICY_HOLD_CONFIRMATION_ONLY',
      unlock_risk_officer_countersign_status: 'FINALIZED',
      unlock_compliance_witness_status: 'FINALIZED',
      unlock_final_human_authorization_seal_status: 'FINALIZED',
      unlock_dual_control_authorization_status: 'FINALIZED',
      unlock_operator_attestation_status: 'FINALIZED',
      unlock_pre_execution_freeze_status: 'FINALIZED',
      unlock_seal_status: 'FINALIZED',
      unlock_final_review_status: 'FINALIZED',
      unlock_approval_status: 'FINALIZED',
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
      unlock_legal_policy_hold_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      unlock_legal_policy_hold_rules_json: {},
      unlock_legal_policy_hold_blockers_json: {},
      non_execution_attestation_json: {},
      write_scope_attestation_json: {},
      source_unlock_risk_officer_countersign_hash: 'roc_hash_dummy',
      source_unlock_compliance_witness_hash: 'cwn_hash_dummy',
      source_unlock_final_human_authorization_seal_hash: 'fhas_hash_dummy',
      source_unlock_dual_control_authorization_hash: 'dcau_hash_dummy',
      source_unlock_operator_attestation_hash: 'oatt_hash_dummy',
      source_unlock_pre_execution_freeze_hash: 'freeze_hash_dummy',
      source_unlock_seal_hash: 'seal_hash_dummy',
      source_unlock_final_review_hash: 'frev_hash_dummy',
      source_unlock_approval_hash: 'apv_hash_dummy',
      source_unlock_eligibility_hash: 'elig_hash_dummy',
      source_redemption_lock_hash: 'lock_hash_dummy',
      source_redemption_final_approval_hash: 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: 'freeze_hash_dummy',
      source_token_material_hash: 'token_material_hash_dummy',
      unlock_legal_policy_hold_hash: 'lph_hash_dummy',
      unlock_legal_policy_hold_evidence_pack_hash: 'lph_ep_hash_dummy',
      evidence_pack_hash: 'lph_ep_hash_dummy',
      lineage_hash_chain_json: {
        phase176_unlock_legal_policy_hold: 'lph_hash_dummy',
        phase175_unlock_risk_officer_countersign: 'roc_hash_dummy',
        phase174_unlock_compliance_witness: 'cwn_hash_dummy',
        phase173_unlock_final_human_authorization_seal: 'fhas_hash_dummy',
        phase172_unlock_dual_control_authorization: 'dcau_hash_dummy',
        phase171_unlock_operator_attestation: 'oatt_hash_dummy',
        phase170_unlock_pre_execution_freeze: 'freeze_hash_dummy',
        phase169_unlock_readiness_seal: 'seal_hash_dummy',
        phase168_unlock_final_review: 'frev_hash_dummy',
        phase167_unlock_approval: 'apv_hash_dummy',
        phase166_unlock_eligibility: 'elig_hash_dummy'
      },
      security_signature_json: {},
      attestation_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_LEGAL_POLICY_HOLD_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      primary_authorizer_id: 'dummy_alice',
      secondary_authorizer_id: 'dummy_bob',
      final_human_authorizer_id: 'dummy_charlie',
      compliance_witness_id: 'dummy_diana',
      risk_officer_id: 'dummy_elena',
      legal_policy_officer_id: 'dummy_felix',
      created_by: 'admin',
      updated_by: 'admin'
    });
    lphBuilder._mockState.rules.set(unlockLegalPolicyHoldId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_era WHERE source_act_token_redempt_unlock_legal_policy_hold_id = ?', [unlockLegalPolicyHoldId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_lph_ev WHERE act_token_redempt_unlock_legal_policy_hold_id = ?', [unlockLegalPolicyHoldId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_lph_rl WHERE act_token_redempt_unlock_legal_policy_hold_id = ?', [unlockLegalPolicyHoldId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_lph_aud WHERE act_token_redempt_unlock_legal_policy_hold_id = ?', [unlockLegalPolicyHoldId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_lph WHERE act_token_redempt_unlock_legal_policy_hold_id = ?', [unlockLegalPolicyHoldId]);

    const draft = await lphBuilder.createTokenRedemptionUnlockLegalPolicyHoldDraft(unlockRiskOfficerCountersignId, 'admin');
    const tempId = draft.tokenRedemptionUnlockLegalPolicyHold.act_token_redempt_unlock_legal_policy_hold_id;

    await lphDecision.recordLegalPolicyOfficer(tempId, 'dummy_felix', 'legal_officer', 'Smoke 177 setup legal policy officer', 'admin');

    await lphEvaluator.evaluateUnlockLegalPolicyHold(tempId, {
      legal_policy_hold_clearance_confirmation: true,
      no_active_legal_hold_confirmed: true,
      no_active_policy_hold_confirmed: true,
      no_active_compliance_freeze_confirmed: true,
      risk_officer_countersign_verified: true,
      compliance_witness_attestation_verified: true,
      final_human_seal_authorizer_unlock_seal_verified: true,
      primary_authorizer_unlock_authorization_verified: true,
      secondary_authorizer_unlock_authorization_verified: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    }, 'admin');

    await lphDecision.recordDecision(tempId, 'APPROVE_LEGAL_POLICY_HOLD', 'Approved for setup', 'admin');
    await lphDecision.finalizeUnlockLegalPolicyHold(tempId, 'admin');

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_lph
       SET act_token_redempt_unlock_legal_policy_hold_id = ?
       WHERE act_token_redempt_unlock_legal_policy_hold_id = ?`,
      [unlockLegalPolicyHoldId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_lph_ev
       SET act_token_redempt_unlock_legal_policy_hold_id = ?
       WHERE act_token_redempt_unlock_legal_policy_hold_id = ?`,
      [unlockLegalPolicyHoldId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_lph_rl
       SET act_token_redempt_unlock_legal_policy_hold_id = ?
       WHERE act_token_redempt_unlock_legal_policy_hold_id = ?`,
      [unlockLegalPolicyHoldId, tempId]
    );
  }
}

async function setupFinalizedUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId, unlockLegalPolicyHoldId, unlockRiskOfficerCountersignId, unlockComplianceWitnessId, unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId) {
  const eraBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityBuilderService').serviceInstance;
  const eraEvaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityEvaluatorService').serviceInstance;
  const eraDecision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityDecisionService').serviceInstance;

  await setupFinalizedUnlockLegalPolicyHold(unlockLegalPolicyHoldId, unlockRiskOfficerCountersignId, unlockComplianceWitnessId, unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

  if (!isProdLike) {
    eraBuilder._mockState.tokenRedemptionUnlockEmergencyRollbackAuthority.set(unlockEmergencyRollbackAuthorityId, {
      act_token_redempt_unlock_emergency_rollback_authority_id: unlockEmergencyRollbackAuthorityId,
      source_act_token_redempt_unlock_legal_policy_hold_id: unlockLegalPolicyHoldId,
      unlock_emergency_rollback_authority_status: 'FINALIZED',
      unlock_emergency_rollback_authority_result: 'EMERGENCY_ROLLBACK_AUTHORITY_CONFIRMED_NOT_UNLOCKED',
      unlock_emergency_rollback_authority_mode: 'EMERGENCY_ROLLBACK_AUTHORITY_CONFIRMATION_ONLY',
      unlock_legal_policy_hold_status: 'FINALIZED',
      unlock_risk_officer_countersign_status: 'FINALIZED',
      unlock_compliance_witness_status: 'FINALIZED',
      unlock_final_human_authorization_seal_status: 'FINALIZED',
      unlock_dual_control_authorization_status: 'FINALIZED',
      unlock_operator_attestation_status: 'FINALIZED',
      unlock_pre_execution_freeze_status: 'FINALIZED',
      unlock_seal_status: 'FINALIZED',
      unlock_final_review_status: 'FINALIZED',
      unlock_approval_status: 'FINALIZED',
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
      unlock_emergency_rollback_authority_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      unlock_emergency_rollback_authority_rules_json: {},
      unlock_emergency_rollback_authority_blockers_json: {},
      non_execution_attestation_json: {},
      write_scope_attestation_json: {},
      source_unlock_legal_policy_hold_hash: 'lph_hash_dummy',
      source_unlock_risk_officer_countersign_hash: 'roc_hash_dummy',
      source_unlock_compliance_witness_hash: 'cwn_hash_dummy',
      source_unlock_final_human_authorization_seal_hash: 'fhas_hash_dummy',
      source_unlock_dual_control_authorization_hash: 'dcau_hash_dummy',
      source_unlock_operator_attestation_hash: 'oatt_hash_dummy',
      source_unlock_pre_execution_freeze_hash: 'freeze_hash_dummy',
      source_unlock_seal_hash: 'seal_hash_dummy',
      source_unlock_final_review_hash: 'frev_hash_dummy',
      source_unlock_approval_hash: 'apv_hash_dummy',
      source_unlock_eligibility_hash: 'elig_hash_dummy',
      source_redemption_lock_hash: 'lock_hash_dummy',
      source_redemption_final_approval_hash: 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: 'freeze_hash_dummy',
      source_token_material_hash: 'token_material_hash_dummy',
      unlock_emergency_rollback_authority_hash: 'era_hash_dummy',
      unlock_emergency_rollback_authority_evidence_pack_hash: 'era_ep_hash_dummy',
      evidence_pack_hash: 'era_ep_hash_dummy',
      lineage_hash_chain_json: {
        phase177_unlock_emergency_rollback_authority: 'era_hash_dummy',
        phase176_unlock_legal_policy_hold: 'lph_hash_dummy',
        phase175_unlock_risk_officer_countersign: 'roc_hash_dummy',
        phase174_unlock_compliance_witness: 'cwn_hash_dummy',
        phase173_unlock_final_human_authorization_seal: 'fhas_hash_dummy',
        phase172_unlock_dual_control_authorization: 'dcau_hash_dummy',
        phase171_unlock_operator_attestation: 'oatt_hash_dummy',
        phase170_unlock_pre_execution_freeze: 'freeze_hash_dummy',
        phase169_unlock_readiness_seal: 'seal_hash_dummy',
        phase168_unlock_final_review: 'frev_hash_dummy',
        phase167_unlock_approval: 'apv_hash_dummy',
        phase166_unlock_eligibility: 'elig_hash_dummy'
      },
      security_signature_json: {},
      attestation_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_EMERGENCY_ROLLBACK_AUTHORITY_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      primary_authorizer_id: 'dummy_alice',
      secondary_authorizer_id: 'dummy_bob',
      final_human_authorizer_id: 'dummy_charlie',
      compliance_witness_id: 'dummy_diana',
      risk_officer_id: 'dummy_elena',
      legal_policy_officer_id: 'dummy_felix',
      rollback_officer_id: 'dummy_george',
      created_by: 'admin',
      updated_by: 'admin'
    });
    eraBuilder._mockState.rules.set(unlockEmergencyRollbackAuthorityId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_ksdr WHERE source_act_token_redempt_unlock_emergency_rollback_authority_id = ?', [unlockEmergencyRollbackAuthorityId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_era_ev WHERE act_token_redempt_unlock_emergency_rollback_authority_id = ?', [unlockEmergencyRollbackAuthorityId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_era_rl WHERE act_token_redempt_unlock_emergency_rollback_authority_id = ?', [unlockEmergencyRollbackAuthorityId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_era_aud WHERE act_token_redempt_unlock_emergency_rollback_authority_id = ?', [unlockEmergencyRollbackAuthorityId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_era WHERE act_token_redempt_unlock_emergency_rollback_authority_id = ?', [unlockEmergencyRollbackAuthorityId]);

    const draft = await eraBuilder.createTokenRedemptionUnlockEmergencyRollbackAuthorityDraft(unlockLegalPolicyHoldId, 'admin');
    const tempId = draft.tokenRedemptionUnlockEmergencyRollbackAuthority.act_token_redempt_unlock_emergency_rollback_authority_id;

    await eraDecision.recordRollbackOfficer(tempId, 'dummy_george', 'rollback_officer', 'Smoke 178 setup rollback officer', 'admin');

    await eraEvaluator.evaluateUnlockEmergencyRollbackAuthority(tempId, {
      emergency_rollback_authority_confirmation: true,
      rollback_officer_assigned_confirmed: true,
      emergency_stop_authority_ready_confirmed: true,
      rollback_channel_available_confirmed: true,
      rollback_runbook_available_confirmed: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      legal_policy_hold_clearance_verified: true,
      risk_officer_countersign_verified: true,
      compliance_witness_attestation_verified: true,
      final_human_seal_authorizer_unlock_seal_verified: true,
      primary_authorizer_unlock_authorization_verified: true,
      secondary_authorizer_unlock_authorization_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    }, 'admin');

    await eraDecision.recordDecision(tempId, 'APPROVE_EMERGENCY_ROLLBACK_AUTHORITY', 'Approved for setup', 'admin');
    await eraDecision.finalizeUnlockEmergencyRollbackAuthority(tempId, 'admin');

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_era
       SET act_token_redempt_unlock_emergency_rollback_authority_id = ?
       WHERE act_token_redempt_unlock_emergency_rollback_authority_id = ?`,
      [unlockEmergencyRollbackAuthorityId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_era_ev
       SET act_token_redempt_unlock_emergency_rollback_authority_id = ?
       WHERE act_token_redempt_unlock_emergency_rollback_authority_id = ?`,
      [unlockEmergencyRollbackAuthorityId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_era_rl
       SET act_token_redempt_unlock_emergency_rollback_authority_id = ?
       WHERE act_token_redempt_unlock_emergency_rollback_authority_id = ?`,
      [unlockEmergencyRollbackAuthorityId, tempId]
    );
  }
}

async function setupFinalizedUnlockKillSwitchDryRun(
  unlockKillSwitchDryRunId,
  unlockEmergencyRollbackAuthorityId,
  unlockLegalPolicyHoldId,
  rocId,
  cwnId,
  fhasId,
  dcauId,
  oattId,
  freezeId,
  sealId,
  frevId,
  apvId,
  eligId,
  lockId,
  fapvId,
  envId,
  authId,
  readinessId,
  issuanceId
) {
  const ksdrBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunBuilderService').serviceInstance;
  const ksdrEvaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunEvaluatorService').serviceInstance;
  const ksdrDecision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunDecisionService').serviceInstance;

  if (!isProdLike) {
    ksdrBuilder._mockState.tokenRedemptionUnlockKillSwitchDryRun.set(unlockKillSwitchDryRunId, {
      act_token_redempt_unlock_kill_switch_dry_run_id: unlockKillSwitchDryRunId,
      source_act_token_redempt_unlock_emergency_rollback_authority_id: unlockEmergencyRollbackAuthorityId,
      source_act_token_redempt_unlock_legal_policy_hold_id: unlockLegalPolicyHoldId,
      source_act_token_redempt_unlock_risk_officer_countersign_id: rocId,
      source_act_token_redempt_unlock_compliance_witness_id: cwnId,
      source_act_token_redempt_unlock_final_human_auth_seal_id: fhasId,
      source_act_token_redempt_unlock_dual_control_authorization_id: dcauId,
      source_act_token_redempt_unlock_operator_attestation_id: oattId,
      source_act_token_redempt_unlock_pre_execution_freeze_id: freezeId,
      source_activation_token_redemption_unlock_seal_id: sealId,
      source_activation_token_redemption_unlock_final_review_id: frevId,
      source_activation_token_redemption_unlock_approval_id: apvId,
      source_activation_token_redemption_unlock_eligibility_id: eligId,
      source_activation_token_redemption_lock_id: lockId,
      source_activation_token_redemption_final_apv_id: fapvId,
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
      unlock_kill_switch_dry_run_status: 'FINALIZED',
      unlock_kill_switch_dry_run_result: 'KILL_SWITCH_DRY_RUN_VERIFIED_NOT_UNLOCKED',
      unlock_kill_switch_dry_run_mode: 'KILL_SWITCH_DRY_RUN_ONLY',
      unlock_emergency_rollback_authority_status: 'FINALIZED',
      unlock_legal_policy_hold_status: 'FINALIZED',
      unlock_risk_officer_countersign_status: 'FINALIZED',
      unlock_compliance_witness_status: 'FINALIZED',
      unlock_final_human_authorization_seal_status: 'FINALIZED',
      unlock_dual_control_authorization_status: 'FINALIZED',
      unlock_operator_attestation_status: 'FINALIZED',
      unlock_pre_execution_freeze_status: 'FINALIZED',
      unlock_seal_status: 'FINALIZED',
      unlock_final_review_status: 'FINALIZED',
      unlock_approval_status: 'FINALIZED',
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
      kill_switch_dry_run_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      kill_switch_dry_run_rules_json: {},
      kill_switch_dry_run_blockers_json: {},
      non_execution_attestation_json: { safe_workflow_boundary_preserved: true },
      write_scope_attestation_json: { writes_only_phase178_tables: true },
      source_unlock_emergency_rollback_authority_hash: 'era_hash_dummy',
      source_unlock_legal_policy_hold_hash: 'lph_hash_dummy',
      source_unlock_risk_officer_countersign_hash: 'roc_hash_dummy',
      source_unlock_compliance_witness_hash: 'cwn_hash_dummy',
      source_unlock_final_human_authorization_seal_hash: 'fhas_hash_dummy',
      source_unlock_dual_control_authorization_hash: 'dcau_hash_dummy',
      source_unlock_operator_attestation_hash: 'oatt_hash_dummy',
      source_unlock_pre_execution_freeze_hash: 'freeze_hash_dummy',
      source_unlock_seal_hash: 'seal_hash_dummy',
      source_unlock_final_review_hash: 'frev_hash_dummy',
      source_unlock_approval_hash: 'apv_hash_dummy',
      source_unlock_eligibility_hash: 'elig_hash_dummy',
      source_redemption_lock_hash: 'lock_hash_dummy',
      source_redemption_final_approval_hash: 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: 'freeze_hash_dummy',
      source_token_material_hash: 'token_material_hash_dummy',
      unlock_kill_switch_dry_run_hash: 'ksdr_hash_dummy',
      unlock_kill_switch_dry_run_evidence_pack_hash: 'ksdr_ep_hash_dummy',
      evidence_pack_hash: 'ksdr_ep_hash_dummy',
      lineage_hash_chain_json: {
        phase178_unlock_kill_switch_dry_run: 'ksdr_hash_dummy',
        phase177_unlock_emergency_rollback_authority: 'era_hash_dummy'
      },
      security_signature_json: {},
      attestation_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_KILL_SWITCH_DRY_RUN_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      primary_authorizer_id: 'dummy_alice',
      secondary_authorizer_id: 'dummy_bob',
      final_human_authorizer_id: 'dummy_charlie',
      compliance_witness_id: 'dummy_diana',
      risk_officer_id: 'dummy_elena',
      legal_policy_officer_id: 'dummy_felix',
      rollback_officer_id: 'dummy_george',
      kill_switch_verification_officer_id: 'dummy_henry',
      created_by: 'admin',
      updated_by: 'admin'
    });
    ksdrBuilder._mockState.rules.set(unlockKillSwitchDryRunId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_fnees WHERE source_act_token_redempt_unlock_kill_switch_dry_run_id = ?', [unlockKillSwitchDryRunId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_ksdr_ev WHERE act_token_redempt_unlock_kill_switch_dry_run_id = ?', [unlockKillSwitchDryRunId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_ksdr_rl WHERE act_token_redempt_unlock_kill_switch_dry_run_id = ?', [unlockKillSwitchDryRunId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_ksdr_aud WHERE act_token_redempt_unlock_kill_switch_dry_run_id = ?', [unlockKillSwitchDryRunId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_ksdr WHERE act_token_redempt_unlock_kill_switch_dry_run_id = ?', [unlockKillSwitchDryRunId]);

    await setupFinalizedUnlockEmergencyRollbackAuthority(
      unlockEmergencyRollbackAuthorityId,
      unlockLegalPolicyHoldId,
      rocId,
      cwnId,
      fhasId,
      dcauId,
      oattId,
      freezeId,
      sealId,
      frevId,
      apvId,
      eligId,
      lockId,
      fapvId,
      envId,
      authId,
      readinessId,
      issuanceId
    );

    const draft = await ksdrBuilder.createTokenRedemptionUnlockKillSwitchDryRunDraft(unlockEmergencyRollbackAuthorityId, 'admin');
    const tempId = draft.tokenRedemptionUnlockKillSwitchDryRun.act_token_redempt_unlock_kill_switch_dry_run_id;

    await ksdrDecision.recordVerificationOfficer(tempId, 'dummy_henry', 'security_officer', 'Smoke 179 setup verification officer', 'admin');

    await ksdrEvaluator.evaluateUnlockKillSwitchDryRun(tempId, {
      kill_switch_dry_run_verification_confirmation: true,
      kill_switch_route_available_confirmed: true,
      kill_switch_dry_run_response_confirmed: true,
      kill_switch_no_runtime_mutation_confirmed: true,
      kill_switch_no_real_execution_confirmed: true,
      rollback_officer_ready_confirmed: true,
      emergency_stop_authority_ready_confirmed: true,
      rollback_channel_available_confirmed: true,
      rollback_runbook_available_confirmed: true,
      non_execution_confirmed: true,
      legal_policy_hold_clearance_verified: true,
      risk_officer_countersign_verified: true,
      compliance_witness_attestation_verified: true,
      final_human_authorization_seal_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    }, 'admin');

    await ksdrDecision.recordDecision(tempId, 'APPROVE_KILL_SWITCH_DRY_RUN', 'Approved for setup', 'admin');
    await ksdrDecision.finalizeUnlockKillSwitchDryRun(tempId, 'admin');

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_ksdr
       SET act_token_redempt_unlock_kill_switch_dry_run_id = ?
       WHERE act_token_redempt_unlock_kill_switch_dry_run_id = ?`,
      [unlockKillSwitchDryRunId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_ksdr_ev
       SET act_token_redempt_unlock_kill_switch_dry_run_id = ?
       WHERE act_token_redempt_unlock_kill_switch_dry_run_id = ?`,
      [unlockKillSwitchDryRunId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_ksdr_rl
       SET act_token_redempt_unlock_kill_switch_dry_run_id = ?
       WHERE act_token_redempt_unlock_kill_switch_dry_run_id = ?`,
      [unlockKillSwitchDryRunId, tempId]
    );
  }
}



async function setupFinalizedUnlockFinalNonExecutionEvidenceSeal(
  unlockFinalNonExecutionEvidenceSealId,
  unlockKillSwitchDryRunId,
  unlockEmergencyRollbackAuthorityId,
  unlockLegalPolicyHoldId,
  rocId,
  cwnId,
  fhasId,
  dcauId,
  oattId,
  freezeId,
  sealId,
  frevId,
  apvId,
  eligId,
  lockId,
  fapvId,
  envId,
  authId,
  readinessId,
  issuanceId
) {
  const fneesBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealBuilderService').serviceInstance;
  const fneesEvaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealEvaluatorService').serviceInstance;
  const fneesDecision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealDecisionService').serviceInstance;

  if (!isProdLike) {
    fneesBuilder._mockState.tokenRedemptionUnlockFinalNonExecutionEvidenceSeal.set(unlockFinalNonExecutionEvidenceSealId, {
      act_token_redempt_unlock_final_non_execution_evidence_seal_id: unlockFinalNonExecutionEvidenceSealId,
      source_act_token_redempt_unlock_kill_switch_dry_run_id: unlockKillSwitchDryRunId,
      source_act_token_redempt_unlock_emergency_rollback_authority_id: unlockEmergencyRollbackAuthorityId,
      source_act_token_redempt_unlock_legal_policy_hold_id: unlockLegalPolicyHoldId,
      source_act_token_redempt_unlock_risk_officer_countersign_id: rocId,
      source_act_token_redempt_unlock_compliance_witness_id: cwnId,
      source_act_token_redempt_unlock_final_human_auth_seal_id: fhasId,
      source_act_token_redempt_unlock_dual_control_authorization_id: dcauId,
      source_act_token_redempt_unlock_operator_attestation_id: oattId,
      source_act_token_redempt_unlock_pre_execution_freeze_id: freezeId,
      source_activation_token_redemption_unlock_seal_id: sealId,
      source_activation_token_redemption_unlock_final_review_id: frevId,
      source_activation_token_redemption_unlock_approval_id: apvId,
      source_activation_token_redemption_unlock_eligibility_id: eligId,
      source_activation_token_redemption_lock_id: lockId,
      source_activation_token_redemption_final_apv_id: fapvId,
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
      unlock_final_non_execution_evidence_seal_status: 'FINALIZED',
      unlock_final_non_execution_evidence_seal_result: 'FINAL_NON_EXECUTION_EVIDENCE_SEALED_NOT_UNLOCKED',
      unlock_final_non_execution_evidence_seal_mode: 'FINAL_NON_EXECUTION_EVIDENCE_SEAL_ONLY',
      unlock_kill_switch_dry_run_status: 'FINALIZED',
      unlock_emergency_rollback_authority_status: 'FINALIZED',
      unlock_legal_policy_hold_status: 'FINALIZED',
      unlock_risk_officer_countersign_status: 'FINALIZED',
      unlock_compliance_witness_status: 'FINALIZED',
      unlock_final_human_authorization_seal_status: 'FINALIZED',
      unlock_dual_control_authorization_status: 'FINALIZED',
      unlock_operator_attestation_status: 'FINALIZED',
      unlock_pre_execution_freeze_status: 'FINALIZED',
      unlock_seal_status: 'FINALIZED',
      unlock_final_review_status: 'FINALIZED',
      unlock_approval_status: 'FINALIZED',
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
      final_non_execution_evidence_summary_json: {},
      impact_review_json: {},
      rollback_review_json: {},
      guardrail_review_json: {},
      final_non_execution_evidence_rules_json: {},
      final_non_execution_evidence_blockers_json: {},
      non_execution_attestation_json: { safe_workflow_boundary_preserved: true },
      write_scope_attestation_json: { writes_only_phase179_tables: true },
      source_unlock_kill_switch_dry_run_hash: 'ksdr_hash_dummy',
      source_unlock_emergency_rollback_authority_hash: 'era_hash_dummy',
      source_unlock_legal_policy_hold_hash: 'lph_hash_dummy',
      source_unlock_risk_officer_countersign_hash: 'roc_hash_dummy',
      source_unlock_compliance_witness_hash: 'cwn_hash_dummy',
      source_unlock_final_human_authorization_seal_hash: 'fhas_hash_dummy',
      source_unlock_dual_control_authorization_hash: 'dcau_hash_dummy',
      source_unlock_operator_attestation_hash: 'oatt_hash_dummy',
      source_unlock_pre_execution_freeze_hash: 'freeze_hash_dummy',
      source_unlock_seal_hash: 'seal_hash_dummy',
      source_unlock_final_review_hash: 'frev_hash_dummy',
      source_unlock_approval_hash: 'apv_hash_dummy',
      source_unlock_eligibility_hash: 'elig_hash_dummy',
      source_redemption_lock_hash: 'lock_hash_dummy',
      source_redemption_final_approval_hash: 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: 'freeze_hash_dummy',
      source_token_material_hash: 'token_material_hash_dummy',
      unlock_final_non_execution_evidence_seal_hash: 'fnees_hash_dummy',
      unlock_final_non_execution_evidence_seal_evidence_pack_hash: 'fnees_ep_hash_dummy',
      evidence_pack_hash: 'fnees_ep_hash_dummy',
      lineage_hash_chain_json: {
        phase179_unlock_final_non_execution_evidence_seal: 'fnees_hash_dummy',
        phase178_unlock_kill_switch_dry_run: 'ksdr_hash_dummy'
      },
      security_signature_json: {},
      attestation_rationale_json: {},
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_FINAL_NON_EXECUTION_EVIDENCE_SEAL_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      primary_authorizer_id: 'dummy_alice',
      secondary_authorizer_id: 'dummy_bob',
      final_human_authorizer_id: 'dummy_charlie',
      compliance_witness_id: 'dummy_diana',
      risk_officer_id: 'dummy_elena',
      legal_policy_officer_id: 'dummy_felix',
      rollback_officer_id: 'dummy_george',
      kill_switch_verification_officer_id: 'dummy_henry',
      evidence_seal_officer_id: 'dummy_karl',
      created_by: 'admin',
      updated_by: 'admin'
    });
    fneesBuilder._mockState.rules.set(unlockFinalNonExecutionEvidenceSealId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_grc WHERE source_unlock_fnees_id = ?', [unlockFinalNonExecutionEvidenceSealId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_fnees_ev WHERE act_token_redempt_unlock_final_non_execution_evidence_seal_id = ?', [unlockFinalNonExecutionEvidenceSealId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_fnees_rl WHERE act_token_redempt_unlock_final_non_execution_evidence_seal_id = ?', [unlockFinalNonExecutionEvidenceSealId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_fnees_aud WHERE act_token_redempt_unlock_final_non_execution_evidence_seal_id = ?', [unlockFinalNonExecutionEvidenceSealId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_fnees WHERE act_token_redempt_unlock_final_non_execution_evidence_seal_id = ?', [unlockFinalNonExecutionEvidenceSealId]);

    await setupFinalizedUnlockKillSwitchDryRun(
      unlockKillSwitchDryRunId,
      unlockEmergencyRollbackAuthorityId,
      unlockLegalPolicyHoldId,
      rocId,
      cwnId,
      fhasId,
      dcauId,
      oattId,
      freezeId,
      sealId,
      frevId,
      apvId,
      eligId,
      lockId,
      fapvId,
      envId,
      authId,
      readinessId,
      issuanceId
    );

    const draft = await fneesBuilder.createTokenRedemptionUnlockFinalNonExecutionEvidenceSealDraft(unlockKillSwitchDryRunId, 'admin');
    const tempId = draft.tokenRedemptionUnlockFinalNonExecutionEvidenceSeal.act_token_redempt_unlock_final_non_execution_evidence_seal_id;

    await fneesDecision.recordEvidenceSealOfficer(tempId, 'dummy_karl', 'compliance_officer', 'Smoke 180 setup evidence seal officer', 'admin');

    await fneesEvaluator.evaluateUnlockFinalNonExecutionEvidenceSeal(tempId, {
      final_non_execution_evidence_seal_confirmation: true,
      token_never_unlocked_confirmed: true,
      token_never_redeemable_confirmed: true,
      token_never_redeemed_confirmed: true,
      high_risk_execution_never_enabled_confirmed: true,
      plan_never_executable_confirmed: true,
      no_real_job_created_confirmed: true,
      no_queue_dispatch_confirmed: true,
      zero_runtime_mutation_confirmed: true,
      kill_switch_dry_run_verified: true,
      emergency_rollback_authority_verified: true,
      legal_policy_hold_clearance_verified: true,
      risk_officer_countersign_verified: true,
      compliance_witness_attestation_verified: true,
      final_human_authorization_seal_verified: true,
      dual_control_authorization_verified: true,
      lineage_integrity_verified: true
    }, 'admin');

    await fneesDecision.recordDecision(tempId, 'APPROVE_FINAL_NON_EXECUTION_EVIDENCE_SEAL', 'Approved for setup', 'admin');
    await fneesDecision.finalizeUnlockFinalNonExecutionEvidenceSeal(tempId, 'admin');

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_fnees
       SET act_token_redempt_unlock_final_non_execution_evidence_seal_id = ?
       WHERE act_token_redempt_unlock_final_non_execution_evidence_seal_id = ?`,
      [unlockFinalNonExecutionEvidenceSealId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_fnees_ev
       SET act_token_redempt_unlock_final_non_execution_evidence_seal_id = ?
       WHERE act_token_redempt_unlock_final_non_execution_evidence_seal_id = ?`,
      [unlockFinalNonExecutionEvidenceSealId, tempId]
    );
    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_fnees_rl
       SET act_token_redempt_unlock_final_non_execution_evidence_seal_id = ?
       WHERE act_token_redempt_unlock_final_non_execution_evidence_seal_id = ?`,
      [unlockFinalNonExecutionEvidenceSealId, tempId]
    );
  }
}

module.exports = {
  setupFinalizedRedemptionLock,
  setupFinalizedUnlockEligibility,
  setupFinalizedUnlockApproval,
  setupFinalizedUnlockFinalReview,
  setupFinalizedUnlockSeal,
  setupFinalizedUnlockPreExecutionFreeze,
  setupFinalizedUnlockOperatorAttestation,
  setupFinalizedUnlockDualControlAuthorization,
  setupFinalizedUnlockFinalHumanAuthorizationSeal,
  setupFinalizedUnlockComplianceWitness,
  setupFinalizedUnlockRiskOfficerCountersign,
  setupFinalizedUnlockLegalPolicyHold,
  setupFinalizedUnlockEmergencyRollbackAuthority,
  setupFinalizedUnlockKillSwitchDryRun,
  setupFinalizedUnlockFinalNonExecutionEvidenceSeal,
  isProdLike
};
