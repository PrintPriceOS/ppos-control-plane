'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewEvaluatorService').serviceInstance;
const { setupFinalizedUnlockApproval, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 168C: Activation Token Redemption Unlock Final Review Evaluator Rules ===\n');

  const approvalId = 'apv_smoke_168c';
  const eligibilityId = 'elg_smoke_168c';
  const lockId = 'lock_smoke_168c';
  const finalApvId = 'fapv_smoke_168c';
  const envId = 'env_smoke_168c';
  const authId = 'auth_smoke_168c';
  const readinessId = 'readiness_smoke_168c';
  const issuanceId = 'issuance_smoke_168c';

  try {
    await setupFinalizedUnlockApproval(approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockFinalReviewDraft(approvalId, 'admin');
    const finalReviewId = draft.tokenRedemptionUnlockFinalReview.activation_token_redemption_unlock_final_review_id;
    console.log(`  Created draft: ${finalReviewId}`);

    const result = await evaluator.evaluateUnlockFinalReview(finalReviewId, {
      security_officer_confirmation: true,
      compliance_officer_confirmation: true,
      operations_director_confirmation: true,
      rollback_authority_confirmation: true,
      kill_switch_confirmation: true,
      non_execution_confirmation: true,
      final_review_no_unlock_confirmation: true
    }, 'admin');

    assert.ok(result);
    assert.strictEqual(result.tokenRedemptionUnlockFinalReview.unlock_final_review_status, 'EVALUATED');
    assert.strictEqual(result.tokenRedemptionUnlockFinalReview.unlock_final_review_result, 'FINAL_REVIEW_PASSED_NOT_UNLOCKED');
    console.log('  PASS: Evaluator ran successfully with confirmations.');

    const rules = result.rules;
    assert.ok(rules.length >= 10);
    console.log(`  PASS: ${rules.length} rules recorded.`);

    const criticals = rules.filter(r => r.severity === 'CRITICAL');
    assert.strictEqual(criticals.length, 0);
    console.log('  PASS: No CRITICAL rules found — evaluation passed cleanly.');

    assert.strictEqual(result.tokenRedemptionUnlockFinalReview.token_unlock_status, 'NOT_UNLOCKED');
    console.log('  PASS: Token remains locked and not redeemable after successful evaluation.');

    console.log('\nSmoke 168C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 168C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
