'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealBuilderService').serviceInstance;
const dualControlBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationBuilderService').serviceInstance;
const { setupFinalizedUnlockDualControlAuthorization, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 173B: Create Unlock Final Human Authorization Seal Draft ===\n');

  const unlockDualControlAuthorizationId = 'dcau_smoke_173b';
  const invalidDualControlId = 'dcau_smoke_173b_draft';
  const unlockOperatorAttestationId = 'oatt_smoke_173b';
  const unlockPreExecutionFreezeId = 'freeze_smoke_173b';
  const unlockSealId = 'seal_smoke_173b';
  const finalReviewId = 'frev_smoke_173b';
  const approvalId = 'apv_smoke_173b';
  const eligibilityId = 'elg_smoke_173b';
  const lockId = 'lock_smoke_173b';
  const finalApvId = 'fapv_smoke_173b';
  const envId = 'env_smoke_173b';
  const authId = 'auth_smoke_173b';
  const readinessId = 'readiness_smoke_173b';
  const issuanceId = 'issuance_smoke_173b';

  try {
    // 1. Setup finalized Phase 172 parent
    await setupFinalizedUnlockDualControlAuthorization(unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    // 2. Setup a non-finalized parent for testing blocking logic
    if (!isProdLike) {
      dualControlBuilder._mockState.tokenRedemptionUnlockDualControlAuthorization.set(invalidDualControlId, {
        activation_token_redemption_unlock_dual_control_authorization_id: invalidDualControlId,
        unlock_dual_control_authorization_status: 'DRAFT',
        token_unlock_status: 'NOT_UNLOCKED',
        token_redeemable_status: 'NOT_REDEEMABLE',
        token_redemption_status: 'LOCKED_NOT_REDEEMED',
        execution_capability_status: 'EXECUTION_NOT_ENABLED',
        plan_executable_status: 'NOT_EXECUTABLE',
        runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
        job_creation_status: 'NO_REAL_JOB_CREATED',
        queue_dispatch_status: 'NO_QUEUE_DISPATCHED'
      });
    } else {
      await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_dcau WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?', [invalidDualControlId]);
      const draftDc = await dualControlBuilder.createTokenRedemptionUnlockDualControlAuthorizationDraft(unlockOperatorAttestationId, 'admin');
      const tempId = draftDc.tokenRedemptionUnlockDualControlAuthorization.activation_token_redemption_unlock_dual_control_authorization_id;
      await db.query(
        'UPDATE cb_cohort_intervention_activation_token_redempt_unlock_dcau SET activation_token_redemption_unlock_dual_control_authorization_id = ? WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?',
        [invalidDualControlId, tempId]
      );
    }

    // 3. Test draft creation from valid parent
    const result = await builder.createTokenRedemptionUnlockFinalHumanAuthorizationSealDraft(unlockDualControlAuthorizationId, 'admin');
    assert.ok(result);
    assert.ok(result.tokenRedemptionUnlockFinalHumanAuthorizationSeal);
    assert.strictEqual(result.tokenRedemptionUnlockFinalHumanAuthorizationSeal.unlock_final_human_authorization_seal_status, 'DRAFT');
    console.log('  PASS: Draft unlock final human authorization seal created successfully from Phase 172 dual-control authorization.');

    // 4. Test blocking creation from non-finalized parent
    await assert.rejects(
      builder.createTokenRedemptionUnlockFinalHumanAuthorizationSealDraft(invalidDualControlId, 'admin'),
      /UNLOCK_DUAL_CONTROL_AUTHORIZATION_NOT_READY/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized dual-control parent.');

    console.log('\nSmoke 173B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 173B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
