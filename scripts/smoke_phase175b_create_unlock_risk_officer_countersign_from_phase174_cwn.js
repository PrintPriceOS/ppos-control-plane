'use strict';

const assert = require('assert');
const { setupFinalizedUnlockComplianceWitness, isProdLike } = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignBuilderService').serviceInstance;
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 175B: Create Unlock Risk Officer Countersign Draft ===');

  const unlockComplianceWitnessId = 'cwn_smoke_175b';
  const unlockFinalHumanAuthorizationSealId = 'fhas_smoke_175b';
  const unlockDualControlAuthorizationId = 'dcau_smoke_175b';
  const unlockOperatorAttestationId = 'oatt_smoke_175b';
  const unlockPreExecutionFreezeId = 'freeze_smoke_175b';
  const unlockSealId = 'seal_smoke_175b';
  const finalReviewId = 'frev_smoke_175b';
  const approvalId = 'apv_smoke_175b';
  const eligibilityId = 'elig_smoke_175b';
  const lockId = 'lock_smoke_175b';
  const finalApvId = 'fapv_smoke_175b';
  const envId = 'env_smoke_175b';
  const authId = 'auth_smoke_175b';
  const readinessId = 'readiness_smoke_175b';
  const issuanceId = 'issuance_smoke_175b';

  try {
    await setupFinalizedUnlockComplianceWitness(unlockComplianceWitnessId, unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockRiskOfficerCountersignDraft(unlockComplianceWitnessId, 'admin');
    assert.ok(draft.tokenRedemptionUnlockRiskOfficerCountersign, 'Draft record is missing');
    assert.strictEqual(draft.tokenRedemptionUnlockRiskOfficerCountersign.source_act_token_redempt_unlock_compliance_witness_id, unlockComplianceWitnessId);
    assert.strictEqual(draft.tokenRedemptionUnlockRiskOfficerCountersign.unlock_risk_officer_countersign_status, 'DRAFT');
    console.log('  PASS: Draft unlock risk officer countersign created successfully from Phase 174 compliance witness.');

    // Attempting to build from an unfinalized parent must throw
    const badParentId = 'cwn_unfinalized_smoke_175b';
    if (!isProdLike) {
      const parentBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessBuilderService').serviceInstance;
      parentBuilder._mockState.tokenRedemptionUnlockComplianceWitness.set(badParentId, {
        act_token_redempt_unlock_compliance_witness_id: badParentId,
        unlock_compliance_witness_status: 'DRAFT',
        unlock_compliance_witness_result: 'COMPLIANCE_WITNESS_FAILED'
      });
    } else {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_cwn WHERE act_token_redempt_unlock_compliance_witness_id = ?`, [badParentId]);
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_cwn
         (act_token_redempt_unlock_compliance_witness_id, source_act_token_redempt_unlock_final_human_auth_seal_id, source_act_token_redempt_unlock_dual_control_authorization_id, source_act_token_redempt_unlock_operator_attestation_id, source_act_token_redempt_unlock_pre_execution_freeze_id, source_activation_token_redemption_unlock_seal_id, source_activation_token_redemption_unlock_final_review_id, source_activation_token_redemption_unlock_approval_id, source_activation_token_redemption_unlock_eligibility_id, source_activation_token_redemption_lock_id, source_activation_token_redemption_final_apv_id, source_activation_token_redemption_envelope_id, source_activation_token_redemption_auth_id, source_activation_token_redemption_readiness_id, source_activation_token_issuance_id, source_activation_token_staging_id, source_activation_token_preflight_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, unlock_compliance_witness_status, unlock_compliance_witness_result, unlock_compliance_witness_mode, unlock_final_human_authorization_seal_status, unlock_dual_control_authorization_status, unlock_operator_attestation_status, unlock_pre_execution_freeze_status, unlock_seal_status, unlock_final_review_status, unlock_approval_status, unlock_eligibility_status, token_redemption_lock_status, token_redemption_status, token_unlock_status, token_redeemable_status, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status, write_scope_status, canary_envelope_json, unlock_compliance_witness_summary_json, impact_review_json, rollback_review_json, guardrail_review_json, unlock_compliance_witness_rules_json, unlock_compliance_witness_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_unlock_final_human_authorization_seal_hash, source_unlock_dual_control_authorization_hash, source_unlock_operator_attestation_hash, source_unlock_pre_execution_freeze_hash, source_unlock_seal_hash, source_unlock_final_review_hash, source_unlock_approval_hash, source_unlock_eligibility_hash, source_redemption_lock_hash, source_redemption_final_approval_hash, source_redemption_package_freeze_hash, source_token_material_hash, unlock_compliance_witness_hash, unlock_compliance_witness_evidence_pack_hash, evidence_pack_hash, lineage_hash_chain_json, security_signature_json, attestation_rationale_json, execution_capability_status, activation_execution_status, package_freeze_status, redemption_package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, primary_authorizer_id, secondary_authorizer_id, final_human_authorizer_id, compliance_witness_id, created_by, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [badParentId, 'fhas', 'dcau', 'oatt', 'freeze', 'seal', 'frev', 'apv', 'elig', 'lock', 'fapv', 'env', 'auth', 'readiness', 'issuance', 'stg', 'pfl', 'pln', 'dsp', 'env', 'auth', 'rd', 'apv', 'prep', 'DRAFT', 'COMPLIANCE_WITNESS_FAILED', 'COMPLIANCE_WITNESS_ONLY', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED', 'LOCKED_NOT_REDEEMED', 'LOCKED_NOT_REDEEMED', 'NOT_UNLOCKED', 'NOT_REDEEMABLE', 'LOW', 'HIGH', 0.1, 0.9, 1.0, 'PASSED', 'PASSED', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11', 'h12', 'h13', 'h14', 'h15', '{}', '{}', '{}', 'EXECUTION_NOT_ENABLED', 'UNLOCK_COMPLIANCE_WITNESS_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'dummy_alice', 'dummy_bob', 'dummy_charlie', 'dummy_diana', 'admin', 'admin']
      );
    }

    await assert.rejects(
      builder.createTokenRedemptionUnlockRiskOfficerCountersignDraft(badParentId, 'admin'),
      /Parent compliance witness must be FINALIZED/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized parent.');

    console.log('\nSmoke 175B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 175B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
