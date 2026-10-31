'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeBuilderService').serviceInstance;
const sealBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealBuilderService').serviceInstance;
const { setupFinalizedUnlockSeal, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 170B: Create Unlock Pre-Execution Freeze Draft ===\n');

  const unlockSealId = 'seal_smoke_170b';
  const invalidSealId = 'seal_smoke_170b_draft';
  const finalReviewId = 'frev_smoke_170b';
  const approvalId = 'apv_smoke_170b';
  const eligibilityId = 'elg_smoke_170b';
  const lockId = 'lock_smoke_170b';
  const finalApvId = 'fapv_smoke_170b';
  const envId = 'env_smoke_170b';
  const authId = 'auth_smoke_170b';
  const readinessId = 'readiness_smoke_170b';
  const issuanceId = 'issuance_smoke_170b';

  try {
    // 1. Setup finalized Phase 169 seal parent
    await setupFinalizedUnlockSeal(unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    // 2. Setup a non-finalized (DRAFT) Phase 169 parent for testing blocking logic
    if (!isProdLike) {
      sealBuilder._mockState.tokenRedemptionUnlockSeal.set(invalidSealId, {
        activation_token_redemption_unlock_seal_id: invalidSealId,
        unlock_seal_status: 'DRAFT',
        token_unlock_status: 'NOT_UNLOCKED',
        token_redeemable_status: 'NOT_REDEEMABLE',
        token_redemption_status: 'LOCKED_NOT_REDEEMED',
        execution_capability_status: 'EXECUTION_NOT_ENABLED',
        plan_executable_status: 'NOT_EXECUTABLE',
        runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
      });
    } else {
      await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_seal WHERE activation_token_redemption_unlock_seal_id = ?', [invalidSealId]);
      const draftSeal = await sealBuilder.createTokenRedemptionUnlockSealDraft(finalReviewId, 'admin');
      const tempId = draftSeal.tokenRedemptionUnlockSeal.activation_token_redemption_unlock_seal_id;
      await db.query(
        'UPDATE cb_cohort_intervention_activation_token_redempt_unlock_seal SET activation_token_redemption_unlock_seal_id = ? WHERE activation_token_redemption_unlock_seal_id = ?',
        [invalidSealId, tempId]
      );
    }

    // 3. Test draft creation from valid parent
    const result = await builder.createTokenRedemptionUnlockPreExecutionFreezeDraft(unlockSealId, 'admin');
    assert.ok(result);
    assert.ok(result.tokenRedemptionUnlockPreExecutionFreeze);
    assert.strictEqual(result.tokenRedemptionUnlockPreExecutionFreeze.unlock_pre_execution_freeze_status, 'DRAFT');
    console.log('  PASS: Draft unlock pre-execution freeze created successfully from Phase 169 seal.');

    // 4. Test blocking creation from non-finalized parent
    await assert.rejects(
      builder.createTokenRedemptionUnlockPreExecutionFreezeDraft(invalidSealId, 'admin'),
      /UNLOCK_SEAL_NOT_READY/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized seal.');

    console.log('\nSmoke 170B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 170B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
