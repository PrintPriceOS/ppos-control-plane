'use strict';

const assert = require('assert');
const { setupFinalizedUnlockRiskOfficerCountersign, isProdLike } = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldBuilderService').serviceInstance;
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 176B: Create Unlock Legal/Policy Hold Draft ===');

  const unlockRiskOfficerCountersignId = 'roc_smoke_176b';
  const unlockComplianceWitnessId = 'cwn_smoke_176b';
  const unlockFinalHumanAuthorizationSealId = 'fhas_smoke_176b';
  const unlockDualControlAuthorizationId = 'dcau_smoke_176b';
  const unlockOperatorAttestationId = 'oatt_smoke_176b';
  const unlockPreExecutionFreezeId = 'freeze_smoke_176b';
  const unlockSealId = 'seal_smoke_176b';
  const finalReviewId = 'frev_smoke_176b';
  const approvalId = 'apv_smoke_176b';
  const eligibilityId = 'elig_smoke_176b';
  const lockId = 'lock_smoke_176b';
  const finalApvId = 'fapv_smoke_176b';
  const envId = 'env_smoke_176b';
  const authId = 'auth_smoke_176b';
  const readinessId = 'readiness_smoke_176b';
  const issuanceId = 'issuance_smoke_176b';

  try {
    await setupFinalizedUnlockRiskOfficerCountersign(
      unlockRiskOfficerCountersignId,
      unlockComplianceWitnessId,
      unlockFinalHumanAuthorizationSealId,
      unlockDualControlAuthorizationId,
      unlockOperatorAttestationId,
      unlockPreExecutionFreezeId,
      unlockSealId,
      finalReviewId,
      approvalId,
      eligibilityId,
      lockId,
      finalApvId,
      envId,
      authId,
      readinessId,
      issuanceId
    );

    const draft = await builder.createTokenRedemptionUnlockLegalPolicyHoldDraft(unlockRiskOfficerCountersignId, 'admin');
    assert.ok(draft.tokenRedemptionUnlockLegalPolicyHold, 'Draft record is missing');
    assert.strictEqual(draft.tokenRedemptionUnlockLegalPolicyHold.source_act_token_redempt_unlock_risk_officer_countersign_id, unlockRiskOfficerCountersignId);
    assert.strictEqual(draft.tokenRedemptionUnlockLegalPolicyHold.unlock_legal_policy_hold_status, 'DRAFT');
    console.log('  PASS: Draft unlock legal/policy hold created successfully from Phase 175 risk officer countersign.');

    // Attempting to build from an unfinalized parent must throw
    const badParentId = 'roc_unfinalized_smoke_176b';
    if (!isProdLike) {
      const parentBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignBuilderService').serviceInstance;
      parentBuilder._mockState.tokenRedemptionUnlockRiskOfficerCountersign.set(badParentId, {
        act_token_redempt_unlock_risk_officer_countersign_id: badParentId,
        unlock_risk_officer_countersign_status: 'DRAFT',
        unlock_risk_officer_countersign_result: 'RISK_OFFICER_COUNTERSIGN_FAILED',
        token_unlock_status: 'NOT_UNLOCKED',
        token_redeemable_status: 'NOT_REDEEMABLE',
        token_redemption_status: 'LOCKED_NOT_REDEEMED',
        execution_capability_status: 'EXECUTION_NOT_ENABLED',
        plan_executable_status: 'NOT_EXECUTABLE',
        job_creation_status: 'NO_REAL_JOB_CREATED',
        queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
        runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
      });
    } else {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_roc WHERE act_token_redempt_unlock_risk_officer_countersign_id = ?`, [badParentId]);
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_roc
         (act_token_redempt_unlock_risk_officer_countersign_id, source_act_token_redempt_unlock_compliance_witness_id, source_act_token_redempt_unlock_final_human_auth_seal_id, source_act_token_redempt_unlock_dual_control_authorization_id, source_act_token_redempt_unlock_operator_attestation_id, source_act_token_redempt_unlock_pre_execution_freeze_id, source_activation_token_redemption_unlock_seal_id, source_activation_token_redemption_unlock_final_review_id, source_activation_token_redemption_unlock_approval_id, source_activation_token_redemption_unlock_eligibility_id, source_activation_token_redemption_lock_id, source_activation_token_redemption_final_apv_id, source_activation_token_redemption_envelope_id, source_activation_token_redemption_auth_id, source_activation_token_redemption_readiness_id, source_activation_token_issuance_id, source_activation_token_staging_id, source_activation_token_preflight_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, cohort_id, tenant_id, simulation_type, unlock_risk_officer_countersign_status, unlock_risk_officer_countersign_result, unlock_risk_officer_countersign_mode, unlock_compliance_witness_status, unlock_final_human_authorization_seal_status, unlock_dual_control_authorization_status, unlock_operator_attestation_status, unlock_pre_execution_freeze_status, unlock_seal_status, unlock_final_review_status, unlock_approval_status, unlock_eligibility_status, token_redemption_lock_status, token_redemption_status, token_unlock_status, token_redeemable_status, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status, write_scope_status, canary_envelope_json, unlock_risk_officer_countersign_summary_json, impact_review_json, rollback_review_json, guardrail_review_json, unlock_risk_officer_countersign_rules_json, unlock_risk_officer_countersign_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_unlock_compliance_witness_hash, source_unlock_final_human_authorization_seal_hash, source_unlock_dual_control_authorization_hash, source_unlock_operator_attestation_hash, source_unlock_pre_execution_freeze_hash, source_unlock_seal_hash, source_unlock_final_review_hash, source_unlock_approval_hash, source_unlock_eligibility_hash, source_redemption_lock_hash, source_redemption_final_approval_hash, source_redemption_package_freeze_hash, source_token_material_hash, unlock_risk_officer_countersign_hash, unlock_risk_officer_countersign_evidence_pack_hash, evidence_pack_hash, lineage_hash_chain_json, security_signature_json, attestation_rationale_json, execution_capability_status, activation_execution_status, package_freeze_status, redemption_package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, primary_authorizer_id, secondary_authorizer_id, final_human_authorizer_id, compliance_witness_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [badParentId, 'cwn', 'fhas', 'dcau', 'oatt', 'freeze', 'seal', 'frev', 'apv', 'elig', 'lock', 'fapv', 'env', 'auth', 'readiness', 'issuance', 'stg', 'pfl', 'pln', 'dsp', 'env', 'auth', 'rd', 'apv', 'prep', 'cohort_dummy', 'tenant_dummy', 'sim_dummy', 'DRAFT', 'RISK_OFFICER_COUNTERSIGN_FAILED', 'RISK_OFFICER_COUNTERSIGN_ONLY', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED', 'LOCKED_NOT_REDEEMED', 'LOCKED_NOT_REDEEMED', 'NOT_UNLOCKED', 'NOT_REDEEMABLE', 'LOW', 'HIGH', 0.1, 0.9, 1.0, 'PASSED', 'PASSED', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11', 'h12', 'h13', 'h14', 'h15', '{}', '{}', '{}', 'EXECUTION_NOT_ENABLED', 'UNLOCK_RISK_OFFICER_COUNTERSIGN_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'dummy_alice', 'dummy_bob', 'dummy_charlie', 'dummy_diana', 'admin', 'admin']
      );
    }

    await assert.rejects(
      builder.createTokenRedemptionUnlockLegalPolicyHoldDraft(badParentId, 'admin'),
      /Parent risk officer countersign must be FINALIZED/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized parent.');

    console.log('\nSmoke 176B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 176B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
