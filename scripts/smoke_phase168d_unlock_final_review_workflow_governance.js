'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewDecisionService').serviceInstance;
const { setupFinalizedUnlockApproval, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 168D: Unlock Final Review Workflow Governance ===\n');

  const approvalId = 'apv_smoke_168d';
  const eligibilityId = 'elg_smoke_168d';
  const lockId = 'lock_smoke_168d';
  const finalApvId = 'fapv_smoke_168d';
  const envId = 'env_smoke_168d';
  const authId = 'auth_smoke_168d';
  const readinessId = 'readiness_smoke_168d';
  const issuanceId = 'issuance_smoke_168d';

  try {
    await setupFinalizedUnlockApproval(approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockFinalReviewDraft(approvalId, 'admin');
    const finalReviewId = draft.tokenRedemptionUnlockFinalReview.activation_token_redemption_unlock_final_review_id;

    // 1. Block finalization before evaluation
    await assert.rejects(
      decisionSvc.finalizeUnlockFinalReview(finalReviewId, 'admin'),
      /UNLOCK_FINAL_REVIEW_NOT_DECIDED/
    );
    console.log('  PASS: Finalization blocked before approval.');

    // 2. Evaluate
    await evaluator.evaluateUnlockFinalReview(finalReviewId, {
      security_officer_confirmation: true,
      compliance_officer_confirmation: true,
      operations_director_confirmation: true,
      rollback_authority_confirmation: true,
      kill_switch_confirmation: true,
      non_execution_confirmation: true,
      final_review_no_unlock_confirmation: true
    }, 'admin');

    // 3. Approve
    const approved = await decisionSvc.recordDecision(finalReviewId, 'APPROVE_FINAL_REVIEW', 'Decision recorded in smoke test', 'admin');
    assert.strictEqual(approved.unlock_final_review_status, 'APPROVED');
    console.log('  PASS: APPROVE decision recorded.');

    // 4. Finalize
    const finalized = await decisionSvc.finalizeUnlockFinalReview(finalReviewId, 'admin');
    assert.strictEqual(finalized.unlock_final_review_status, 'FINALIZED');
    console.log('  PASS: Finalized unlock final review successfully.');

    // 5. Block mutations after finalization
    await assert.rejects(
      decisionSvc.recordDecision(finalReviewId, 'REJECT_FINAL_REVIEW', 'Attempt change finalized', 'admin'),
      /UNLOCK_FINAL_REVIEW_IMMUTABLE/
    );
    console.log('  PASS: Mutations blocked after finalization.');

    // 6. Verify security boundary state
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    console.log('  PASS: Token remains locked and not redeemable.');

    console.log('\nSmoke 168D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 168D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
