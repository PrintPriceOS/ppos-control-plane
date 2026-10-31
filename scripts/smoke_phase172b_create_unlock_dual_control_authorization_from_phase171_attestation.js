'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationBuilderService').serviceInstance;
const operatorAttestationBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationBuilderService').serviceInstance;
const { setupFinalizedUnlockOperatorAttestation, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 172B: Create Unlock Dual-Control Authorization Draft ===\n');

  const unlockOperatorAttestationId = 'oatt_smoke_172b';
  const invalidAttestationId = 'oatt_smoke_172b_draft';
  const unlockPreExecutionFreezeId = 'freeze_smoke_172b';
  const unlockSealId = 'seal_smoke_172b';
  const finalReviewId = 'frev_smoke_172b';
  const approvalId = 'apv_smoke_172b';
  const eligibilityId = 'elg_smoke_172b';
  const lockId = 'lock_smoke_172b';
  const finalApvId = 'fapv_smoke_172b';
  const envId = 'env_smoke_172b';
  const authId = 'auth_smoke_172b';
  const readinessId = 'readiness_smoke_172b';
  const issuanceId = 'issuance_smoke_172b';

  try {
    // 1. Setup finalized Phase 171 parent
    await setupFinalizedUnlockOperatorAttestation(unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    // 2. Setup a non-finalized parent for testing blocking logic
    if (!isProdLike) {
      operatorAttestationBuilder._mockState.tokenRedemptionUnlockOperatorAttestation.set(invalidAttestationId, {
        activation_token_redemption_unlock_operator_attestation_id: invalidAttestationId,
        unlock_operator_attestation_status: 'DRAFT',
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
      await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_oatt WHERE activation_token_redemption_unlock_operator_attestation_id = ?', [invalidAttestationId]);
      const draftAtt = await operatorAttestationBuilder.createTokenRedemptionUnlockOperatorAttestationDraft(unlockPreExecutionFreezeId, 'admin');
      const tempId = draftAtt.tokenRedemptionUnlockOperatorAttestation.activation_token_redemption_unlock_operator_attestation_id;
      await db.query(
        'UPDATE cb_cohort_intervention_activation_token_redempt_unlock_oatt SET activation_token_redemption_unlock_operator_attestation_id = ? WHERE activation_token_redemption_unlock_operator_attestation_id = ?',
        [invalidAttestationId, tempId]
      );
    }

    // 3. Test draft creation from valid parent
    const result = await builder.createTokenRedemptionUnlockDualControlAuthorizationDraft(unlockOperatorAttestationId, 'admin');
    assert.ok(result);
    assert.ok(result.tokenRedemptionUnlockDualControlAuthorization);
    assert.strictEqual(result.tokenRedemptionUnlockDualControlAuthorization.unlock_dual_control_authorization_status, 'DRAFT');
    console.log('  PASS: Draft unlock dual-control authorization created successfully from Phase 171 operator attestation.');

    // 4. Test blocking creation from non-finalized parent
    await assert.rejects(
      builder.createTokenRedemptionUnlockDualControlAuthorizationDraft(invalidAttestationId, 'admin'),
      /UNLOCK_OPERATOR_ATTESTATION_NOT_READY/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized attestation parent.');

    console.log('\nSmoke 172B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 172B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
