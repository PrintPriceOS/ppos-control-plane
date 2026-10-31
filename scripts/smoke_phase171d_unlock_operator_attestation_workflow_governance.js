'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationDecisionService').serviceInstance;
const { setupFinalizedUnlockPreExecutionFreeze, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 171D: Unlock Operator Attestation Workflow Governance ===\n');

  const unlockPreExecutionFreezeId = 'freeze_smoke_171d';
  const unlockSealId = 'seal_smoke_171d';
  const finalReviewId = 'frev_smoke_171d';
  const approvalId = 'apv_smoke_171d';
  const eligibilityId = 'elg_smoke_171d';
  const lockId = 'lock_smoke_171d';
  const finalApvId = 'fapv_smoke_171d';
  const envId = 'env_smoke_171d';
  const authId = 'auth_smoke_171d';
  const readinessId = 'readiness_smoke_171d';
  const issuanceId = 'issuance_smoke_171d';

  try {
    await setupFinalizedUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockOperatorAttestationDraft(unlockPreExecutionFreezeId, 'admin');
    const unlockOperatorAttestationId = draft.tokenRedemptionUnlockOperatorAttestation.activation_token_redemption_unlock_operator_attestation_id;

    // 1. Block finalization before evaluation
    await assert.rejects(
      decisionSvc.finalizeUnlockOperatorAttestation(unlockOperatorAttestationId, 'admin'),
      /UNLOCK_OPERATOR_ATTESTATION_NOT_DECIDED/
    );
    console.log('  PASS: Finalization blocked before approval.');

    // 2. Evaluate
    await evaluator.evaluateUnlockOperatorAttestation(unlockOperatorAttestationId, {
      security_officer_unlock_attestation_confirmation: true,
      compliance_officer_unlock_attestation_confirmation: true,
      operations_director_unlock_attestation_confirmation: true,
      rollback_authority_unlock_attestation_confirmation: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true,
      operator_attestation_confirmed: true
    }, 'admin');

    // 3. Approve
    const approved = await decisionSvc.recordDecision(unlockOperatorAttestationId, 'APPROVE_ATTESTATION', 'Decision recorded in smoke test', 'admin');
    assert.strictEqual(approved.unlock_operator_attestation_status, 'APPROVED');
    console.log('  PASS: APPROVE_ATTESTATION decision recorded.');

    // 4. Finalize
    const finalized = await decisionSvc.finalizeUnlockOperatorAttestation(unlockOperatorAttestationId, 'admin');
    assert.strictEqual(finalized.unlock_operator_attestation_status, 'FINALIZED');
    console.log('  PASS: Finalized unlock operator attestation successfully.');

    // 5. Block mutations after finalization
    await assert.rejects(
      decisionSvc.recordDecision(unlockOperatorAttestationId, 'REJECT_ATTESTATION', 'Attempt change finalized', 'admin'),
      /UNLOCK_OPERATOR_ATTESTATION_IMMUTABLE/
    );
    console.log('  PASS: Mutations blocked after finalization.');

    // 6. Verify security boundary state
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    console.log('  PASS: Token remains locked and not redeemable.');

    console.log('\nSmoke 171D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 171D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
