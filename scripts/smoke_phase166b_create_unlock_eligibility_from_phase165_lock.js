'use strict';

const assert = require('assert');
const { setupFinalizedRedemptionLock, isProdLike } = require('./smoke_phase166_setup_helper');
const db = require('../src/api/services/mysqlClient');
const lockBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService').serviceInstance;

(async () => {
  console.log('=== Smoke 166B: Create Unlock Eligibility Draft ===\n');

  try {
    const lockId = 'atl_166b_1';
    const finalApvId = 'atfa_166b_1';
    const envId = 'ate_166b_1';
    const authId = 'ata_166b_1';
    const readinessId = 'atr_166b_1';
    const issuanceId = 'ati_166b_1';

    await setupFinalizedRedemptionLock(lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const result = await builder.createTokenRedemptionUnlockEligibilityDraft(lockId, 'admin');
    assert.ok(result.tokenRedemptionUnlockEligibility);
    assert.strictEqual(result.tokenRedemptionUnlockEligibility.unlock_eligibility_status, 'DRAFT');
    assert.strictEqual(result.tokenRedemptionUnlockEligibility.source_activation_token_redemption_lock_id, lockId);
    console.log('  PASS: Draft unlock eligibility created successfully from Phase 165 redemption lock.');

    // Negative case: draft from non-finalized lock parent
    const invalidLockId = 'atl_invalid';
    if (!isProdLike) {
      lockBuilder._mockState.tokenRedemptionLock.set(invalidLockId, {
        activation_token_redemption_lock_id: invalidLockId,
        activation_token_redemption_lock_status: 'DRAFT'
      });
    } else {
      await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_lock WHERE activation_token_redemption_lock_id = ?', [invalidLockId]);
      const draftLock = await lockBuilder.createTokenRedemptionLockDraft(finalApvId, 'admin');
      const tempId = draftLock.tokenRedemptionLock.activation_token_redemption_lock_id;
      await db.query(
        'UPDATE cb_cohort_intervention_activation_token_redempt_lock SET activation_token_redemption_lock_id = ? WHERE activation_token_redemption_lock_id = ?',
        [invalidLockId, tempId]
      );
    }

    await assert.rejects(
      builder.createTokenRedemptionUnlockEligibilityDraft(invalidLockId, 'admin'),
      /TOKEN_REDEMPTION_LOCK_NOT_READY/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized lock.');

    console.log('\nSmoke 166B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 166B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
