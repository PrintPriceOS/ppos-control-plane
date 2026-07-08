'use strict';

const assert = require('assert');
const { setupFinalizedRedemptionLock, isProdLike } = require('./smoke_phase166_setup_helper');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityEvaluatorService').serviceInstance;

(async () => {
  console.log('=== Smoke 166C: Activation Token Redemption Unlock Eligibility Evaluator Rules ===\n');

  try {
    const lockId = 'atl_166c_1';
    const finalApvId = 'atfa_166c_1';
    const envId = 'ate_166c_1';
    const authId = 'ata_166c_1';
    const readinessId = 'atr_166c_1';
    const issuanceId = 'ati_166c_1';

    await setupFinalizedRedemptionLock(lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockEligibilityDraft(lockId, 'admin');
    const eligibilityId = draft.tokenRedemptionUnlockEligibility.activation_token_redemption_unlock_eligibility_id;
    console.log(`  Created draft: ${eligibilityId}`);

    // Evaluate with validations/confirmations
    const evalResult = await evaluator.evaluateUnlockEligibility(eligibilityId, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true
    }, 'admin');
    assert.ok(evalResult);
    console.log('  PASS: Evaluator ran successfully with confirmations.');

    const rules = await evaluator.getLockRules(eligibilityId);
    assert.ok(Array.isArray(rules));
    console.log(`  PASS: ${rules.length} rules recorded.`);

    const criticals = rules.filter(r => r.severity === 'CRITICAL');
    assert.strictEqual(criticals.length, 0, `No CRITICAL rules expected when all officers confirmed, got: ${criticals.map(r => r.description).join(', ')}`);
    console.log('  PASS: No CRITICAL rules found — evaluation passed cleanly.');

    const updatedRec = await builder.getTokenRedemptionUnlockEligibility(eligibilityId);
    assert.strictEqual(updatedRec.unlock_eligibility_result, 'UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED');
    assert.strictEqual(updatedRec.token_redeemable_status, 'NOT_REDEEMABLE');
    assert.strictEqual(updatedRec.actual_unlock_status, 'NOT_UNLOCKED');
    console.log('  PASS: Token remains locked and not redeemable after successful evaluation.');

    console.log('\nSmoke 166C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 166C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
