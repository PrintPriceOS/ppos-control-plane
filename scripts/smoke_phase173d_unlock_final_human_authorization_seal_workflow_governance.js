'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealDecisionService').serviceInstance;
const { setupFinalizedUnlockDualControlAuthorization, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 173D: Unlock Final Human Authorization Seal Workflow Governance ===\n');

  const unlockDualControlAuthorizationId = 'dcau_smoke_173d';
  const unlockOperatorAttestationId = 'oatt_smoke_173d';
  const unlockPreExecutionFreezeId = 'freeze_smoke_173d';
  const unlockSealId = 'seal_smoke_173d';
  const finalReviewId = 'frev_smoke_173d';
  const approvalId = 'apv_smoke_173d';
  const eligibilityId = 'elg_smoke_173d';
  const lockId = 'lock_smoke_173d';
  const finalApvId = 'fapv_smoke_173d';
  const envId = 'env_smoke_173d';
  const authId = 'auth_smoke_173d';
  const readinessId = 'readiness_smoke_173d';
  const issuanceId = 'issuance_smoke_173d';

  try {
    await setupFinalizedUnlockDualControlAuthorization(unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockFinalHumanAuthorizationSealDraft(unlockDualControlAuthorizationId, 'admin');
    const unlockFinalHumanAuthorizationSealId = draft.tokenRedemptionUnlockFinalHumanAuthorizationSeal.act_token_redempt_unlock_final_human_authorization_seal_id;

    // 1. Final human authorizer duplicates primary or secondary must be rejected
    await assert.rejects(
      decisionSvc.recordFinalHumanAuthorizer(unlockFinalHumanAuthorizationSealId, 'dummy_alice', 'operations_director', 'Duplicate primary authorizer'),
      /FINAL_HUMAN_AUTHORIZER_DUPLICATES_PRIMARY_FORBIDDEN/
    );
    await assert.rejects(
      decisionSvc.recordFinalHumanAuthorizer(unlockFinalHumanAuthorizationSealId, 'dummy_bob', 'compliance_officer', 'Duplicate secondary authorizer'),
      /FINAL_HUMAN_AUTHORIZER_DUPLICATES_SECONDARY_FORBIDDEN/
    );
    console.log('  PASS: Separation of duties enforced. Human authorizer cannot duplicate dual-control authorizers.');

    // 2. Record unique final human authorizer
    await decisionSvc.recordFinalHumanAuthorizer(unlockFinalHumanAuthorizationSealId, 'user_charlie', 'system_admin', 'Attestation recorded');

    // 3. Block finalization before evaluation
    await assert.rejects(
      decisionSvc.finalizeUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, 'admin'),
      /UNLOCK_FINAL_HUMAN_AUTHORIZATION_SEAL_NOT_DECIDED/
    );
    console.log('  PASS: Finalization blocked before approval.');

    // 4. Evaluate
    await evaluator.evaluateUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, {
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

    // 5. Approve
    const approved = await decisionSvc.recordDecision(unlockFinalHumanAuthorizationSealId, 'APPROVE_FINAL_SEAL', 'Decision recorded in smoke test', 'admin');
    assert.strictEqual(approved.unlock_final_human_authorization_seal_status, 'APPROVED');
    console.log('  PASS: APPROVE_FINAL_SEAL decision recorded.');

    // 6. Finalize
    const finalized = await decisionSvc.finalizeUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, 'admin');
    assert.strictEqual(finalized.unlock_final_human_authorization_seal_status, 'FINALIZED');
    console.log('  PASS: Finalized unlock final human authorization seal successfully.');

    // 7. Block mutations after finalization
    await assert.rejects(
      decisionSvc.recordDecision(unlockFinalHumanAuthorizationSealId, 'REJECT_FINAL_SEAL', 'Attempt change finalized', 'admin'),
      /UNLOCK_FINAL_HUMAN_AUTHORIZATION_SEAL_IMMUTABLE/
    );
    console.log('  PASS: Mutations blocked after finalization.');

    // 8. Verify security boundary state
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    console.log('  PASS: Token remains locked and not redeemable.');

    console.log('\nSmoke 173D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 173D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
