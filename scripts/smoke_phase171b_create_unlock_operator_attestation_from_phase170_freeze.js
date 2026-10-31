'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationBuilderService').serviceInstance;
const freezeBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeBuilderService').serviceInstance;
const { setupFinalizedUnlockPreExecutionFreeze, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 171B: Create Unlock Operator Attestation Draft ===\n');

  const unlockPreExecutionFreezeId = 'freeze_smoke_171b';
  const invalidFreezeId = 'freeze_smoke_171b_draft';
  const unlockSealId = 'seal_smoke_171b';
  const finalReviewId = 'frev_smoke_171b';
  const approvalId = 'apv_smoke_171b';
  const eligibilityId = 'elg_smoke_171b';
  const lockId = 'lock_smoke_171b';
  const finalApvId = 'fapv_smoke_171b';
  const envId = 'env_smoke_171b';
  const authId = 'auth_smoke_171b';
  const readinessId = 'readiness_smoke_171b';
  const issuanceId = 'issuance_smoke_171b';

  try {
    // 1. Setup finalized Phase 170 freeze parent
    await setupFinalizedUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    // 2. Setup a non-finalized (DRAFT) Phase 170 parent for testing blocking logic
    if (!isProdLike) {
      freezeBuilder._mockState.tokenRedemptionUnlockPreExecutionFreeze.set(invalidFreezeId, {
        activation_token_redemption_unlock_pre_execution_freeze_id: invalidFreezeId,
        unlock_pre_execution_freeze_status: 'DRAFT',
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
      await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_pfrz WHERE activation_token_redemption_unlock_pre_execution_freeze_id = ?', [invalidFreezeId]);
      const draftFreeze = await freezeBuilder.createTokenRedemptionUnlockPreExecutionFreezeDraft(unlockSealId, 'admin');
      const tempId = draftFreeze.tokenRedemptionUnlockPreExecutionFreeze.activation_token_redemption_unlock_pre_execution_freeze_id;
      await db.query(
        'UPDATE cb_cohort_intervention_activation_token_redempt_unlock_pfrz SET activation_token_redemption_unlock_pre_execution_freeze_id = ? WHERE activation_token_redemption_unlock_pre_execution_freeze_id = ?',
        [invalidFreezeId, tempId]
      );
    }

    // 3. Test draft creation from valid parent
    const result = await builder.createTokenRedemptionUnlockOperatorAttestationDraft(unlockPreExecutionFreezeId, 'admin');
    assert.ok(result);
    assert.ok(result.tokenRedemptionUnlockOperatorAttestation);
    assert.strictEqual(result.tokenRedemptionUnlockOperatorAttestation.unlock_operator_attestation_status, 'DRAFT');
    console.log('  PASS: Draft unlock operator attestation created successfully from Phase 170 pre-execution freeze.');

    // 4. Test blocking creation from non-finalized parent
    await assert.rejects(
      builder.createTokenRedemptionUnlockOperatorAttestationDraft(invalidFreezeId, 'admin'),
      /UNLOCK_PRE_EXECUTION_FREEZE_NOT_READY/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized freeze.');

    console.log('\nSmoke 170B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 171B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
