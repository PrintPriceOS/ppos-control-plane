'use strict';

const assert = require('assert');
const { setupFinalizedUnlockRiskOfficerCountersign, isProdLike } = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldEvaluatorService').serviceInstance;
const decisionService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldDecisionService').serviceInstance;
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 176D: Activation Token Redemption Unlock Legal / Policy Hold Decision ===');

  const unlockRiskOfficerCountersignId = 'roc_smoke_176d';
  const unlockComplianceWitnessId = 'cwn_smoke_176d';
  const unlockFinalHumanAuthorizationSealId = 'fhas_smoke_176d';
  const unlockDualControlAuthorizationId = 'dcau_smoke_176d';
  const unlockOperatorAttestationId = 'oatt_smoke_176d';
  const unlockPreExecutionFreezeId = 'freeze_smoke_176d';
  const unlockSealId = 'seal_smoke_176d';
  const finalReviewId = 'frev_smoke_176d';
  const approvalId = 'apv_smoke_176d';
  const eligibilityId = 'elig_smoke_176d';
  const lockId = 'lock_smoke_176d';
  const finalApvId = 'fapv_smoke_176d';
  const envId = 'env_smoke_176d';
  const authId = 'auth_smoke_176d';
  const readinessId = 'readiness_smoke_176d';
  const issuanceId = 'issuance_smoke_176d';

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

    // 1. Record legal policy officer with invalid role
    await assert.rejects(
      decisionService.recordLegalPolicyOfficer(lphId, 'dummy_officer_176d', 'invalid_role', 'Testing invalid role', 'admin'),
      /LEGAL_POLICY_OFFICER_ROLE_INVALID/
    );
    console.log('  PASS: Correctly rejected invalid legal officer role.');

    // Record correct officer
    await decisionService.recordLegalPolicyOfficer(lphId, 'dummy_officer_176d', 'legal_officer', 'Testing correct role', 'admin');

    // 2. Try recording decision before evaluation
    await assert.rejects(
      decisionService.recordDecision(lphId, 'APPROVE_LEGAL_POLICY_HOLD', 'Approval rationale', 'admin'),
      /Evaluation is required before recording decision/
    );
    console.log('  PASS: Correctly blocked decision when not evaluated.');

    // Evaluate correctly
    const confirmations = {
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
    };
    await evaluator.evaluateUnlockLegalPolicyHold(lphId, confirmations, 'admin');

    // 3. Try invalid decision type
    await assert.rejects(
      decisionService.recordDecision(lphId, 'INVALID_DECISION_TYPE', 'Bad type', 'admin'),
      /INVALID_DECISION: Supported decisions are/
    );
    console.log('  PASS: Correctly rejected invalid decision type.');

    // 4. Record Approve Decision
    const approved = await decisionService.recordDecision(lphId, 'APPROVE_LEGAL_POLICY_HOLD', 'Approved legal hold clearance', 'admin');
    assert.strictEqual(approved.unlock_legal_policy_hold_status, 'APPROVED');
    assert.strictEqual(approved.unlock_legal_policy_hold_result, 'LEGAL_POLICY_HOLD_CLEARED_NOT_UNLOCKED');
    console.log('  PASS: Recorded approve decision successfully.');

    console.log('\nSmoke 176D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 176D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
