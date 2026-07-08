'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewBuilderService').serviceInstance;
const apvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalBuilderService').serviceInstance;
const { setupFinalizedUnlockApproval, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 168B: Create Unlock Final Review Draft ===\n');

  const approvalId = 'apv_smoke_168b';
  const invalidApvId = 'apv_smoke_168b_draft';
  const eligibilityId = 'elg_smoke_168b';
  const lockId = 'lock_smoke_168b';
  const finalApvId = 'fapv_smoke_168b';
  const envId = 'env_smoke_168b';
  const authId = 'auth_smoke_168b';
  const readinessId = 'readiness_smoke_168b';
  const issuanceId = 'issuance_smoke_168b';

  try {
    // 1. Setup finalized Phase 167 approval parent
    await setupFinalizedUnlockApproval(approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    // 2. Setup a non-finalized (DRAFT) Phase 167 parent for testing blocking logic
    if (!isProdLike) {
      apvBuilder._mockState.tokenRedemptionUnlockApproval.set(invalidApvId, {
        activation_token_redemption_unlock_approval_id: invalidApvId,
        unlock_approval_status: 'DRAFT',
        token_unlock_status: 'NOT_UNLOCKED',
        token_redeemable_status: 'NOT_REDEEMABLE',
        token_redemption_status: 'LOCKED_NOT_REDEEMED',
        execution_capability_status: 'EXECUTION_NOT_ENABLED',
        plan_executable_status: 'NOT_EXECUTABLE',
        runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
      });
    } else {
      await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_apv WHERE activation_token_redemption_unlock_approval_id = ?', [invalidApvId]);
      const draftApv = await apvBuilder.createTokenRedemptionUnlockApprovalDraft(eligibilityId, 'admin');
      const tempId = draftApv.tokenRedemptionUnlockApproval.activation_token_redemption_unlock_approval_id;
      await db.query(
        'UPDATE cb_cohort_intervention_activation_token_redempt_unlock_apv SET activation_token_redemption_unlock_approval_id = ? WHERE activation_token_redemption_unlock_approval_id = ?',
        [invalidApvId, tempId]
      );
    }

    // 3. Test draft creation from valid parent
    const result = await builder.createTokenRedemptionUnlockFinalReviewDraft(approvalId, 'admin');
    assert.ok(result);
    assert.ok(result.tokenRedemptionUnlockFinalReview);
    assert.strictEqual(result.tokenRedemptionUnlockFinalReview.unlock_final_review_status, 'DRAFT');
    console.log('  PASS: Draft unlock final review created successfully from Phase 167 approval.');

    // 4. Test blocking creation from non-finalized parent
    await assert.rejects(
      builder.createTokenRedemptionUnlockFinalReviewDraft(invalidApvId, 'admin'),
      /UNLOCK_APPROVAL_NOT_READY/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized approval.');

    console.log('\nSmoke 168B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 168B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
