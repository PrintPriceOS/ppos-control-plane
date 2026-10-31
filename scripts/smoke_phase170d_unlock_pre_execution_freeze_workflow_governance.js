'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeDecisionService').serviceInstance;
const { setupFinalizedUnlockSeal, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 170D: Unlock Pre-Execution Freeze Workflow Governance ===\n');

  const unlockSealId = 'seal_smoke_170d';
  const finalReviewId = 'frev_smoke_170d';
  const approvalId = 'apv_smoke_170d';
  const eligibilityId = 'elg_smoke_170d';
  const lockId = 'lock_smoke_170d';
  const finalApvId = 'fapv_smoke_170d';
  const envId = 'env_smoke_170d';
  const authId = 'auth_smoke_170d';
  const readinessId = 'readiness_smoke_170d';
  const issuanceId = 'issuance_smoke_170d';

  try {
    await setupFinalizedUnlockSeal(unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockPreExecutionFreezeDraft(unlockSealId, 'admin');
    const unlockPreExecutionFreezeId = draft.tokenRedemptionUnlockPreExecutionFreeze.activation_token_redemption_unlock_pre_execution_freeze_id;

    // 1. Block finalization before evaluation
    await assert.rejects(
      decisionSvc.finalizeUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, 'admin'),
      /UNLOCK_PRE_EXECUTION_FREEZE_NOT_DECIDED/
    );
    console.log('  PASS: Finalization blocked before approval.');

    // 2. Evaluate
    await evaluator.evaluateUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, {
      security_officer_unlock_freeze_confirmation: true,
      compliance_officer_unlock_freeze_confirmation: true,
      operations_director_unlock_freeze_confirmation: true,
      rollback_authority_unlock_freeze_confirmation: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    }, 'admin');

    // 3. Approve
    const approved = await decisionSvc.recordDecision(unlockPreExecutionFreezeId, 'APPROVE_FREEZE', 'Decision recorded in smoke test', 'admin');
    assert.strictEqual(approved.unlock_pre_execution_freeze_status, 'APPROVED');
    console.log('  PASS: APPROVE_FREEZE decision recorded.');

    // 4. Finalize
    const finalized = await decisionSvc.finalizeUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, 'admin');
    assert.strictEqual(finalized.unlock_pre_execution_freeze_status, 'FINALIZED');
    console.log('  PASS: Finalized unlock pre-execution freeze successfully.');

    // 5. Block mutations after finalization
    await assert.rejects(
      decisionSvc.recordDecision(unlockPreExecutionFreezeId, 'REJECT_FREEZE', 'Attempt change finalized', 'admin'),
      /UNLOCK_PRE_EXECUTION_FREEZE_IMMUTABLE/
    );
    console.log('  PASS: Mutations blocked after finalization.');

    // 6. Verify security boundary state
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    console.log('  PASS: Token remains locked and not redeemable.');

    console.log('\nSmoke 170D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 170D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
