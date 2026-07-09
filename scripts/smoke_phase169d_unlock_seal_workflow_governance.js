'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealDecisionService').serviceInstance;
const { setupFinalizedUnlockFinalReview, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 169D: Unlock Seal Workflow Governance ===\n');

  const finalReviewId = 'frev_smoke_169d';
  const approvalId = 'apv_smoke_169d';
  const eligibilityId = 'elg_smoke_169d';
  const lockId = 'lock_smoke_169d';
  const finalApvId = 'fapv_smoke_169d';
  const envId = 'env_smoke_169d';
  const authId = 'auth_smoke_169d';
  const readinessId = 'readiness_smoke_169d';
  const issuanceId = 'issuance_smoke_169d';

  try {
    await setupFinalizedUnlockFinalReview(finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockSealDraft(finalReviewId, 'admin');
    const unlockSealId = draft.tokenRedemptionUnlockSeal.activation_token_redemption_unlock_seal_id;

    // 1. Block finalization before evaluation
    await assert.rejects(
      decisionSvc.finalizeUnlockSeal(unlockSealId, 'admin'),
      /UNLOCK_SEAL_NOT_DECIDED/
    );
    console.log('  PASS: Finalization blocked before approval.');

    // 2. Evaluate
    await evaluator.evaluateUnlockSeal(unlockSealId, {
      security_officer_confirmation: true,
      compliance_officer_confirmation: true,
      operations_director_confirmation: true,
      rollback_authority_confirmation: true,
      kill_switch_confirmation: true,
      non_execution_confirmation: true,
      final_review_unlock_readiness_confirmation: true,
      seal_authenticity_confirmation: true
    }, 'admin');

    // 3. Approve
    const approved = await decisionSvc.recordDecision(unlockSealId, 'APPROVE_SEAL', 'Decision recorded in smoke test', 'admin');
    assert.strictEqual(approved.unlock_seal_status, 'APPROVED');
    console.log('  PASS: APPROVE decision recorded.');

    // 4. Finalize
    const finalized = await decisionSvc.finalizeUnlockSeal(unlockSealId, 'admin');
    assert.strictEqual(finalized.unlock_seal_status, 'FINALIZED');
    console.log('  PASS: Finalized unlock readiness seal successfully.');

    // 5. Block mutations after finalization
    await assert.rejects(
      decisionSvc.recordDecision(unlockSealId, 'REJECT_SEAL', 'Attempt change finalized', 'admin'),
      /UNLOCK_SEAL_IMMUTABLE/
    );
    console.log('  PASS: Mutations blocked after finalization.');

    // 6. Verify security boundary state
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    console.log('  PASS: Token remains locked and not redeemable.');

    console.log('\nSmoke 169D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 169D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
