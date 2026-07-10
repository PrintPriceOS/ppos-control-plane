'use strict';

const assert = require('assert');
const { setupFinalizedUnlockRiskOfficerCountersign, isProdLike } = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldEvaluatorService').serviceInstance;
const decisionService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldDecisionService').serviceInstance;
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 176C: Activation Token Redemption Unlock Legal / Policy Hold Evaluator Rules ===');

  const unlockRiskOfficerCountersignId = 'roc_smoke_176c';
  const unlockComplianceWitnessId = 'cwn_smoke_176c';
  const unlockFinalHumanAuthorizationSealId = 'fhas_smoke_176c';
  const unlockDualControlAuthorizationId = 'dcau_smoke_176c';
  const unlockOperatorAttestationId = 'oatt_smoke_176c';
  const unlockPreExecutionFreezeId = 'freeze_smoke_176c';
  const unlockSealId = 'seal_smoke_176c';
  const finalReviewId = 'frev_smoke_176c';
  const approvalId = 'apv_smoke_176c';
  const eligibilityId = 'elig_smoke_176c';
  const lockId = 'lock_smoke_176c';
  const finalApvId = 'fapv_smoke_176c';
  const envId = 'env_smoke_176c';
  const authId = 'auth_smoke_176c';
  const readinessId = 'readiness_smoke_176c';
  const issuanceId = 'issuance_smoke_176c';

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
    const lphId = draft.tokenRedemptionUnlockLegalPolicyHold.act_token_redempt_unlock_legal_policy_hold_id;

    // Record a legal officer first (required by evaluator rules or decision flow)
    await decisionService.recordLegalPolicyOfficer(lphId, 'dummy_legal_officer_176c', 'legal_officer', 'Testing rules', 'admin');

    // 1. Evaluate with missing confirmations -> should fail
    const badConfirmations = {
      legal_policy_hold_clearance_confirmation: false, // missing
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
    };

    const resBad = await evaluator.evaluateUnlockLegalPolicyHold(lphId, badConfirmations, 'admin');
    assert.strictEqual(resBad.tokenRedemptionUnlockLegalPolicyHold.unlock_legal_policy_hold_status, 'BLOCKED');
    assert.strictEqual(resBad.tokenRedemptionUnlockLegalPolicyHold.unlock_legal_policy_hold_result, 'LEGAL_POLICY_HOLD_CONFIRMATION_FAILED');
    console.log('  PASS: Correctly blocked when confirmations are missing.');

    // 2. Evaluate with active legal hold present -> should fail
    const activeHoldConfirmations = { ...badConfirmations, legal_policy_hold_clearance_confirmation: true, no_active_legal_hold_confirmed: false };
    const resActive = await evaluator.evaluateUnlockLegalPolicyHold(lphId, activeHoldConfirmations, 'admin');
    assert.strictEqual(resActive.tokenRedemptionUnlockLegalPolicyHold.unlock_legal_policy_hold_status, 'BLOCKED');
    console.log('  PASS: Correctly blocked when active legal hold is present.');

    // 3. Separation of duties violation: officer matches risk officer
    const duplicateDraft = await builder.createTokenRedemptionUnlockLegalPolicyHoldDraft(unlockRiskOfficerCountersignId, 'admin');
    const duplicateLphId = duplicateDraft.tokenRedemptionUnlockLegalPolicyHold.act_token_redempt_unlock_legal_policy_hold_id;

    await assert.rejects(
      decisionService.recordLegalPolicyOfficer(duplicateLphId, 'dummy_elena', 'legal_officer', 'Violates separation', 'admin'),
      /LEGAL_POLICY_OFFICER_DUPLICATES_PRIOR_AUTHORIZER_FORBIDDEN/
    );
    console.log('  PASS: Correctly blocked duplicate actor violation.');

    console.log('\nSmoke 176C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 176C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
