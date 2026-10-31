'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealEvaluatorService').serviceInstance;
const { setupFinalizedUnlockFinalReview, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 169C: Activation Token Redemption Unlock Seal Evaluator Rules ===\n');

  const finalReviewId = 'frev_smoke_169c';
  const approvalId = 'apv_smoke_169c';
  const eligibilityId = 'elg_smoke_169c';
  const lockId = 'lock_smoke_169c';
  const finalApvId = 'fapv_smoke_169c';
  const envId = 'env_smoke_169c';
  const authId = 'auth_smoke_169c';
  const readinessId = 'readiness_smoke_169c';
  const issuanceId = 'issuance_smoke_169c';

  try {
    await setupFinalizedUnlockFinalReview(finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockSealDraft(finalReviewId, 'admin');
    const unlockSealId = draft.tokenRedemptionUnlockSeal.activation_token_redemption_unlock_seal_id;
    console.log(`  Created draft: ${unlockSealId}`);

    const result = await evaluator.evaluateUnlockSeal(unlockSealId, {
      security_officer_confirmation: true,
      compliance_officer_confirmation: true,
      operations_director_confirmation: true,
      rollback_authority_confirmation: true,
      kill_switch_confirmation: true,
      non_execution_confirmation: true,
      final_review_unlock_readiness_confirmation: true,
      seal_authenticity_confirmation: true
    }, 'admin');

    assert.ok(result);
    assert.strictEqual(result.tokenRedemptionUnlockSeal.unlock_seal_status, 'EVALUATED');
    assert.strictEqual(result.tokenRedemptionUnlockSeal.unlock_seal_result, 'UNLOCK_READINESS_SEALED_NOT_UNLOCKED');
    console.log('  PASS: Evaluator ran successfully with confirmations.');

    const rules = result.rules;
    assert.ok(rules.length >= 10);
    console.log(`  PASS: ${rules.length} rules recorded.`);

    const criticals = rules.filter(r => r.severity === 'CRITICAL');
    assert.strictEqual(criticals.length, 0);
    console.log('  PASS: No CRITICAL rules found — evaluation passed cleanly.');

    assert.strictEqual(result.tokenRedemptionUnlockSeal.token_unlock_status, 'NOT_UNLOCKED');
    console.log('  PASS: Token remains locked and not redeemable after successful evaluation.');

    console.log('\nSmoke 169C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 169C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
