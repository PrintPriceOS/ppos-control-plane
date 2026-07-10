'use strict';

const assert = require('assert');
const { setupFinalizedUnlockFinalHumanAuthorizationSeal, isProdLike } = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessBuilderService').serviceInstance;
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 174B: Create Unlock Compliance Witness Draft ===');

  const unlockComplianceWitnessId = 'cwn_smoke_174b';
  const unlockFinalHumanAuthorizationSealId = 'fhas_smoke_174b';
  const unlockDualControlAuthorizationId = 'dcau_smoke_174b';
  const unlockOperatorAttestationId = 'oatt_smoke_174b';
  const unlockPreExecutionFreezeId = 'freeze_smoke_174b';
  const unlockSealId = 'seal_smoke_174b';
  const finalReviewId = 'frev_smoke_174b';
  const approvalId = 'apv_smoke_174b';
  const eligibilityId = 'elig_smoke_174b';
  const lockId = 'lock_smoke_174b';
  const finalApvId = 'fapv_smoke_174b';
  const envId = 'env_smoke_174b';
  const authId = 'auth_smoke_174b';
  const readinessId = 'readiness_smoke_174b';
  const issuanceId = 'issuance_smoke_174b';

  try {
    await setupFinalizedUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockComplianceWitnessDraft(unlockFinalHumanAuthorizationSealId, 'admin');
    assert.ok(draft.tokenRedemptionUnlockComplianceWitness, 'Draft record is missing');
    assert.strictEqual(draft.tokenRedemptionUnlockComplianceWitness.source_act_token_redempt_unlock_final_human_auth_seal_id, unlockFinalHumanAuthorizationSealId);
    assert.strictEqual(draft.tokenRedemptionUnlockComplianceWitness.unlock_compliance_witness_status, 'DRAFT');
    console.log('  PASS: Draft unlock compliance witness created successfully from Phase 173 final human authorization seal.');

    // Attempting to build from an unfinalized parent must throw
    const badParentId = 'fhas_unfinalized_smoke_174b';
    if (!isProdLike) {
      const parentBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealBuilderService').serviceInstance;
      parentBuilder._mockState.tokenRedemptionUnlockFinalHumanAuthorizationSeal.set(badParentId, {
        act_token_redempt_unlock_final_human_authorization_seal_id: badParentId,
        unlock_final_human_authorization_seal_status: 'DRAFT',
        unlock_final_human_authorization_seal_result: 'FINAL_HUMAN_AUTHORIZATION_SEAL_FAILED'
      });
    } else {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_fhas WHERE act_token_redempt_unlock_final_human_authorization_seal_id = ?`, [badParentId]);
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_fhas
         (act_token_redempt_unlock_final_human_authorization_seal_id, source_act_token_redempt_unlock_dual_control_authorization_id, source_act_token_redempt_unlock_operator_attestation_id, source_act_token_redempt_unlock_pre_execution_freeze_id, source_activation_token_redemption_unlock_seal_id, source_activation_token_redemption_unlock_final_review_id, source_activation_token_redemption_unlock_approval_id, source_activation_token_redemption_unlock_eligibility_id, source_activation_token_redemption_lock_id, source_activation_token_redemption_final_apv_id, source_activation_token_redemption_envelope_id, source_activation_token_redemption_auth_id, source_activation_token_redemption_readiness_id, source_activation_token_issuance_id, source_activation_token_staging_id, source_activation_token_preflight_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, unlock_final_human_authorization_seal_status, unlock_final_human_authorization_seal_result, unlock_final_human_authorization_seal_mode, unlock_dual_control_authorization_status, unlock_operator_attestation_status, unlock_pre_execution_freeze_status, unlock_seal_status, unlock_final_review_status, unlock_approval_status, unlock_eligibility_status, token_redemption_lock_status, token_redemption_status, token_unlock_status, token_redeemable_status, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status, write_scope_status, canary_envelope_json, unlock_final_human_authorization_seal_summary_json, impact_review_json, rollback_review_json, guardrail_review_json, unlock_final_human_authorization_seal_rules_json, unlock_final_human_authorization_seal_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_unlock_dual_control_authorization_hash, source_unlock_operator_attestation_hash, source_unlock_pre_execution_freeze_hash, source_unlock_seal_hash, source_unlock_final_review_hash, source_unlock_approval_hash, source_unlock_eligibility_hash, source_redemption_lock_hash, source_redemption_final_approval_hash, source_redemption_package_freeze_hash, source_token_material_hash, unlock_final_human_authorization_seal_hash, unlock_final_human_authorization_seal_evidence_pack_hash, evidence_pack_hash, lineage_hash_chain_json, security_signature_json, attestation_rationale_json, execution_capability_status, activation_execution_status, package_freeze_status, redemption_package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, primary_authorizer_id, secondary_authorizer_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [badParentId, 'dcau', 'oatt', 'freeze', 'seal', 'frev', 'apv', 'elig', 'lock', 'fapv', 'env', 'auth', 'readiness', 'issuance', 'stg', 'pfl', 'pln', 'dsp', 'env', 'auth', 'rd', 'apv', 'prep', 'DRAFT', 'FINAL_HUMAN_AUTHORIZATION_SEAL_FAILED', 'FINAL_HUMAN_SEAL_ONLY', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED', 'LOCKED_NOT_REDEEMED', 'LOCKED_NOT_REDEEMED', 'NOT_UNLOCKED', 'NOT_REDEEMABLE', 'LOW', 'HIGH', 0.1, 0.9, 1.0, 'PASSED', 'PASSED', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11', 'h12', 'h13', 'h14', '{}', '{}', '{}', 'EXECUTION_NOT_ENABLED', 'UNLOCK_FINAL_HUMAN_AUTHORIZATION_SEAL_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'dummy_alice', 'dummy_bob', 'admin', 'admin']
      );
    }

    await assert.rejects(
      builder.createTokenRedemptionUnlockComplianceWitnessDraft(badParentId, 'admin'),
      /Parent final human authorization seal must be FINALIZED/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized parent.');

    console.log('\nSmoke 174B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 174B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
