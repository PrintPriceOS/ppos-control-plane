'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalBuilderService').serviceInstance;
const eligBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService').serviceInstance;
const { setupFinalizedUnlockEligibility, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 167B: Create Unlock Approval Draft ===\n');

  const eligibilityId = 'elg_smoke_167b';
  const invalidEligId = 'elg_smoke_167b_draft';
  const lockId = 'lock_smoke_167b';
  const finalApvId = 'fapv_smoke_167b';
  const envId = 'env_smoke_167b';
  const authId = 'auth_smoke_167b';
  const readinessId = 'readiness_smoke_167b';
  const issuanceId = 'issuance_smoke_167b';

  try {
    // 1. Setup finalized Phase 166 eligibility parent
    await setupFinalizedUnlockEligibility(eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    // 2. Setup a non-finalized (DRAFT) Phase 166 parent for testing blocking logic
    if (!isProdLike) {
      eligBuilder._mockState.tokenRedemptionUnlockEligibility.set(invalidEligId, {
        activation_token_redemption_unlock_eligibility_id: invalidEligId,
        unlock_eligibility_status: 'DRAFT',
        actual_unlock_status: 'NOT_UNLOCKED',
        token_redeemable_status: 'NOT_REDEEMABLE',
        execution_capability_status: 'EXECUTION_NOT_ENABLED',
        runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
      });
    } else {
      await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_elig WHERE activation_token_redemption_unlock_eligibility_id = ?', [invalidEligId]);
      const draftElig = await eligBuilder.createTokenRedemptionUnlockEligibilityDraft(lockId, 'admin');
      const tempId = draftElig.tokenRedemptionUnlockEligibility.activation_token_redemption_unlock_eligibility_id;
      await db.query(
        'UPDATE cb_cohort_intervention_activation_token_redempt_unlock_elig SET activation_token_redemption_unlock_eligibility_id = ? WHERE activation_token_redemption_unlock_eligibility_id = ?',
        [invalidEligId, tempId]
      );
    }

    // 3. Test draft creation from valid parent
    const result = await builder.createTokenRedemptionUnlockApprovalDraft(eligibilityId, 'admin');
    assert.ok(result);
    assert.ok(result.tokenRedemptionUnlockApproval);
    assert.strictEqual(result.tokenRedemptionUnlockApproval.unlock_approval_status, 'DRAFT');
    console.log('  PASS: Draft unlock approval created successfully from Phase 166 eligibility.');

    // 4. Test blocking creation from non-finalized parent
    await assert.rejects(
      builder.createTokenRedemptionUnlockApprovalDraft(invalidEligId, 'admin'),
      /UNLOCK_ELIGIBILITY_NOT_READY/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized eligibility.');

    console.log('\nSmoke 167B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 167B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
