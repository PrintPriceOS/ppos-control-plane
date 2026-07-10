'use strict';

const assert = require('assert');
const { setupFinalizedUnlockRiskOfficerCountersign, isProdLike } = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldEvaluatorService').serviceInstance;
const decisionService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldDecisionService').serviceInstance;
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 176H: Phase 176 Rollback & Safety Boundaries Check ===');

  const unlockRiskOfficerCountersignId = 'roc_smoke_176h';
  const unlockComplianceWitnessId = 'cwn_smoke_176h';
  const unlockFinalHumanAuthorizationSealId = 'fhas_smoke_176h';
  const unlockDualControlAuthorizationId = 'dcau_smoke_176h';
  const unlockOperatorAttestationId = 'oatt_smoke_176h';
  const unlockPreExecutionFreezeId = 'freeze_smoke_176h';
  const unlockSealId = 'seal_smoke_176h';
  const finalReviewId = 'frev_smoke_176h';
  const approvalId = 'apv_smoke_176h';
  const eligibilityId = 'elig_smoke_176h';
  const lockId = 'lock_smoke_176h';
  const finalApvId = 'fapv_smoke_176h';
  const envId = 'env_smoke_176h';
  const authId = 'auth_smoke_176h';
  const readinessId = 'readiness_smoke_176h';
  const issuanceId = 'issuance_smoke_176h';

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

    // Record officer
    await decisionService.recordLegalPolicyOfficer(lphId, 'dummy_officer_176h', 'legal_officer', 'Testing safety', 'admin');

    // Evaluate
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

    // Approve
    await decisionService.recordDecision(lphId, 'APPROVE_LEGAL_POLICY_HOLD', 'Testing safety', 'admin');

    // Finalize
    const finalized = await decisionService.finalizeUnlockLegalPolicyHold(lphId, 'admin');

    // Assert safety boundary states
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    assert.strictEqual(finalized.token_redemption_status, 'LOCKED_NOT_REDEEMED');
    assert.strictEqual(finalized.execution_capability_status, 'EXECUTION_NOT_ENABLED');
    assert.strictEqual(finalized.activation_execution_status, 'UNLOCK_LEGAL_POLICY_HOLD_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED');
    assert.strictEqual(finalized.package_freeze_status, 'FROZEN_IMMUTABLE');
    assert.strictEqual(finalized.redemption_package_freeze_status, 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE');
    assert.strictEqual(finalized.plan_executable_status, 'NOT_EXECUTABLE');
    assert.strictEqual(finalized.job_creation_status, 'NO_REAL_JOB_CREATED');
    assert.strictEqual(finalized.queue_dispatch_status, 'NO_QUEUE_DISPATCHED');
    assert.strictEqual(finalized.runtime_mutation_status, 'ZERO_RUNTIME_MUTATION_CONFIRMED');

    console.log('  PASS: Safety boundary confirmed intact at finalizing stage.');

    console.log('\nSmoke 176H: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 176H:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
