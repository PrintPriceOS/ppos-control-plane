'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeEvaluatorService').serviceInstance;
const { setupFinalizedUnlockSeal, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 170C: Activation Token Redemption Unlock Pre-Execution Freeze Evaluator Rules ===\n');

  const unlockSealId = 'seal_smoke_170c';
  const finalReviewId = 'frev_smoke_170c';
  const approvalId = 'apv_smoke_170c';
  const eligibilityId = 'elg_smoke_170c';
  const lockId = 'lock_smoke_170c';
  const finalApvId = 'fapv_smoke_170c';
  const envId = 'env_smoke_170c';
  const authId = 'auth_smoke_170c';
  const readinessId = 'readiness_smoke_170c';
  const issuanceId = 'issuance_smoke_170c';

  try {
    await setupFinalizedUnlockSeal(unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockPreExecutionFreezeDraft(unlockSealId, 'admin');
    const unlockPreExecutionFreezeId = draft.tokenRedemptionUnlockPreExecutionFreeze.activation_token_redemption_unlock_pre_execution_freeze_id;
    console.log(`  Created draft: ${unlockPreExecutionFreezeId}`);

    const result = await evaluator.evaluateUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, {
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

    assert.ok(result);
    assert.strictEqual(result.tokenRedemptionUnlockPreExecutionFreeze.unlock_pre_execution_freeze_status, 'EVALUATED');
    assert.strictEqual(result.tokenRedemptionUnlockPreExecutionFreeze.unlock_pre_execution_freeze_result, 'UNLOCK_PRE_EXECUTION_FROZEN_NOT_UNLOCKED');
    console.log('  PASS: Evaluator ran successfully with confirmations.');

    const rules = result.rules;
    assert.ok(rules.length >= 11);
    console.log(`  PASS: ${rules.length} rules recorded.`);

    const criticals = rules.filter(r => r.severity === 'CRITICAL');
    assert.strictEqual(criticals.length, 0);
    console.log('  PASS: No CRITICAL rules found — evaluation passed cleanly.');

    assert.strictEqual(result.tokenRedemptionUnlockPreExecutionFreeze.token_unlock_status, 'NOT_UNLOCKED');
    console.log('  PASS: Token remains locked and not redeemable after successful evaluation.');

    console.log('\nSmoke 170C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 170C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
