'use strict';

const assert = require('assert');
const { setupFinalizedRedemptionLock, isProdLike } = require('./smoke_phase166_setup_helper');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityDecisionService').serviceInstance;

(async () => {
  console.log('=== Smoke 166D: Unlock Eligibility Workflow Governance ===\n');

  try {
    const lockId = 'atl_166d_1';
    const finalApvId = 'atfa_166d_1';
    const envId = 'ate_166d_1';
    const authId = 'ata_166d_1';
    const readinessId = 'atr_166d_1';
    const issuanceId = 'ati_166d_1';

    await setupFinalizedRedemptionLock(lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockEligibilityDraft(lockId, 'admin');
    const eligibilityId = draft.tokenRedemptionUnlockEligibility.activation_token_redemption_unlock_eligibility_id;

    // 1. Cannot finalize before evaluation/decision
    await assert.rejects(
      decisionSvc.finalizeUnlockEligibility(eligibilityId, 'admin'),
      /FINALIZATION_BLOCKED/
    );
    console.log('  PASS: Finalization blocked before approval.');

    // 2. Evaluate
    await evaluator.evaluateUnlockEligibility(eligibilityId, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true
    }, 'admin');

    // 3. Approve
    await decisionSvc.recordDecision(eligibilityId, 'APPROVE', 'Workflow governance test approval', 'admin');
    console.log('  PASS: APPROVE decision recorded.');

    // 4. Finalize
    const finalized = await decisionSvc.finalizeUnlockEligibility(eligibilityId, 'admin');
    assert.strictEqual(finalized.unlock_eligibility_status, 'FINALIZED');
    assert.ok(finalized.unlock_eligibility_hash);
    console.log('  PASS: Finalized unlock eligibility successfully.');

    // 5. Immutable after finalization
    await assert.rejects(
      decisionSvc.recordDecision(eligibilityId, 'APPROVE', 'Attempting mutation post-finalize', 'admin'),
      /LOCK_IMMUTABLE/
    );
    console.log('  PASS: Mutations blocked after finalization.');

    // 6. Token status checks
    assert.strictEqual(finalized.actual_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    console.log('  PASS: Token remains locked and not redeemable.');

    console.log('\nSmoke 166D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 166D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
