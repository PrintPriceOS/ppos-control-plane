'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalEvaluatorService').serviceInstance;
const { setupFinalizedUnlockEligibility, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 167C: Activation Token Redemption Unlock Approval Evaluator Rules ===\n');

  const eligibilityId = 'elg_smoke_167c';
  const lockId = 'lock_smoke_167c';
  const finalApvId = 'fapv_smoke_167c';
  const envId = 'env_smoke_167c';
  const authId = 'auth_smoke_167c';
  const readinessId = 'readiness_smoke_167c';
  const issuanceId = 'issuance_smoke_167c';

  try {
    await setupFinalizedUnlockEligibility(eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockApprovalDraft(eligibilityId, 'admin');
    const approvalId = draft.tokenRedemptionUnlockApproval.activation_token_redemption_unlock_approval_id;
    console.log(`  Created draft: ${approvalId}`);

    const result = await evaluator.evaluateUnlockApproval(approvalId, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true
    }, 'admin');

    assert.ok(result);
    assert.strictEqual(result.tokenRedemptionUnlockApproval.unlock_approval_status, 'EVALUATED');
    assert.strictEqual(result.tokenRedemptionUnlockApproval.unlock_approval_result, 'UNLOCK_APPROVAL_PASSED_NOT_UNLOCKED');
    console.log('  PASS: Evaluator ran successfully with confirmations.');

    const rules = result.rules;
    assert.ok(rules.length >= 10);
    console.log(`  PASS: ${rules.length} rules recorded.`);

    const criticals = rules.filter(r => r.severity === 'CRITICAL');
    assert.strictEqual(criticals.length, 0);
    console.log('  PASS: No CRITICAL rules found — evaluation passed cleanly.');

    assert.strictEqual(result.tokenRedemptionUnlockApproval.token_unlock_status, 'NOT_UNLOCKED');
    console.log('  PASS: Token remains locked and not redeemable after successful evaluation.');

    console.log('\nSmoke 167C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 167C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
