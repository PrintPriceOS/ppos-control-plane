'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealBuilderService').serviceInstance;
const frevBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewBuilderService').serviceInstance;
const { setupFinalizedUnlockFinalReview, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 169B: Create Unlock Seal Draft ===\n');

  const finalReviewId = 'frev_smoke_169b';
  const invalidFrevId = 'frev_smoke_169b_draft';
  const approvalId = 'apv_smoke_169b';
  const eligibilityId = 'elg_smoke_169b';
  const lockId = 'lock_smoke_169b';
  const finalApvId = 'fapv_smoke_169b';
  const envId = 'env_smoke_169b';
  const authId = 'auth_smoke_169b';
  const readinessId = 'readiness_smoke_169b';
  const issuanceId = 'issuance_smoke_169b';

  try {
    // 1. Setup finalized Phase 168 final review parent
    await setupFinalizedUnlockFinalReview(finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    // 2. Setup a non-finalized (DRAFT) Phase 168 parent for testing blocking logic
    if (!isProdLike) {
      frevBuilder._mockState.tokenRedemptionUnlockFinalReview.set(invalidFrevId, {
        activation_token_redemption_unlock_final_review_id: invalidFrevId,
        unlock_final_review_status: 'DRAFT',
        token_unlock_status: 'NOT_UNLOCKED',
        token_redeemable_status: 'NOT_REDEEMABLE',
        token_redemption_status: 'LOCKED_NOT_REDEEMED',
        execution_capability_status: 'EXECUTION_NOT_ENABLED',
        plan_executable_status: 'NOT_EXECUTABLE',
        runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
      });
    } else {
      await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_frev WHERE activation_token_redemption_unlock_final_review_id = ?', [invalidFrevId]);
      const draftFrev = await frevBuilder.createTokenRedemptionUnlockFinalReviewDraft(approvalId, 'admin');
      const tempId = draftFrev.tokenRedemptionUnlockFinalReview.activation_token_redemption_unlock_final_review_id;
      await db.query(
        'UPDATE cb_cohort_intervention_activation_token_redempt_unlock_frev SET activation_token_redemption_unlock_final_review_id = ? WHERE activation_token_redemption_unlock_final_review_id = ?',
        [invalidFrevId, tempId]
      );
    }

    // 3. Test draft creation from valid parent
    const result = await builder.createTokenRedemptionUnlockSealDraft(finalReviewId, 'admin');
    assert.ok(result);
    assert.ok(result.tokenRedemptionUnlockSeal);
    assert.strictEqual(result.tokenRedemptionUnlockSeal.unlock_seal_status, 'DRAFT');
    console.log('  PASS: Draft unlock seal created successfully from Phase 168 final review.');

    // 4. Test blocking creation from non-finalized parent
    await assert.rejects(
      builder.createTokenRedemptionUnlockSealDraft(invalidFrevId, 'admin'),
      /UNLOCK_FINAL_REVIEW_NOT_READY/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized final review.');

    console.log('\nSmoke 169B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 169B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
