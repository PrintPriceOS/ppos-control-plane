'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationDecisionService').serviceInstance;
const { setupFinalizedUnlockOperatorAttestation, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 172D: Unlock Dual-Control Authorization Workflow Governance ===\n');

  const unlockOperatorAttestationId = 'oatt_smoke_172d';
  const unlockPreExecutionFreezeId = 'freeze_smoke_172d';
  const unlockSealId = 'seal_smoke_172d';
  const finalReviewId = 'frev_smoke_172d';
  const approvalId = 'apv_smoke_172d';
  const eligibilityId = 'elg_smoke_172d';
  const lockId = 'lock_smoke_172d';
  const finalApvId = 'fapv_smoke_172d';
  const envId = 'env_smoke_172d';
  const authId = 'auth_smoke_172d';
  const readinessId = 'readiness_smoke_172d';
  const issuanceId = 'issuance_smoke_172d';

  try {
    await setupFinalizedUnlockOperatorAttestation(unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockDualControlAuthorizationDraft(unlockOperatorAttestationId, 'admin');
    const unlockDualControlAuthorizationId = draft.tokenRedemptionUnlockDualControlAuthorization.activation_token_redemption_unlock_dual_control_authorization_id;

    // 1. Separation of duties: same authorizer should be rejected
    await decisionSvc.recordPrimaryAuthorizer(unlockDualControlAuthorizationId, 'user_alice', 'operations_director');
    await assert.rejects(
      decisionSvc.recordSecondaryAuthorizer(unlockDualControlAuthorizationId, 'user_alice', 'compliance_officer'),
      /DUAL_CONTROL_SAME_AUTHORIZER_FORBIDDEN/
    );
    console.log('  PASS: Separation of duties enforced (same authorizer rejected).');

    // 2. Add different secondary authorizer
    await decisionSvc.recordSecondaryAuthorizer(unlockDualControlAuthorizationId, 'user_bob', 'compliance_officer');

    // 3. Block finalization before evaluation
    await assert.rejects(
      decisionSvc.finalizeUnlockDualControlAuthorization(unlockDualControlAuthorizationId, 'admin'),
      /UNLOCK_DUAL_CONTROL_AUTHORIZATION_NOT_DECIDED/
    );
    console.log('  PASS: Finalization blocked before approval.');

    // 4. Evaluate
    await evaluator.evaluateUnlockDualControlAuthorization(unlockDualControlAuthorizationId, {
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

    // 5. Approve
    const approved = await decisionSvc.recordDecision(unlockDualControlAuthorizationId, 'APPROVE_DUAL_CONTROL', 'Decision recorded in smoke test', 'admin');
    assert.strictEqual(approved.unlock_dual_control_authorization_status, 'APPROVED');
    console.log('  PASS: APPROVE_DUAL_CONTROL decision recorded.');

    // 6. Finalize
    const finalized = await decisionSvc.finalizeUnlockDualControlAuthorization(unlockDualControlAuthorizationId, 'admin');
    assert.strictEqual(finalized.unlock_dual_control_authorization_status, 'FINALIZED');
    console.log('  PASS: Finalized unlock dual-control authorization successfully.');

    // 7. Block mutations after finalization
    await assert.rejects(
      decisionSvc.recordDecision(unlockDualControlAuthorizationId, 'REJECT_DUAL_CONTROL', 'Attempt change finalized', 'admin'),
      /UNLOCK_DUAL_CONTROL_AUTHORIZATION_IMMUTABLE/
    );
    console.log('  PASS: Mutations blocked after finalization.');

    // 8. Verify security boundary state
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    console.log('  PASS: Token remains locked and not redeemable.');

    console.log('\nSmoke 172D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 172D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
