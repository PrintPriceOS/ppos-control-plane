'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationEvaluatorService').serviceInstance;
const { setupFinalizedUnlockPreExecutionFreeze, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 171C: Activation Token Redemption Unlock Operator Attestation Evaluator Rules ===\n');

  const unlockPreExecutionFreezeId = 'freeze_smoke_171c';
  const unlockSealId = 'seal_smoke_171c';
  const finalReviewId = 'frev_smoke_171c';
  const approvalId = 'apv_smoke_171c';
  const eligibilityId = 'elg_smoke_171c';
  const lockId = 'lock_smoke_171c';
  const finalApvId = 'fapv_smoke_171c';
  const envId = 'env_smoke_171c';
  const authId = 'auth_smoke_171c';
  const readinessId = 'readiness_smoke_171c';
  const issuanceId = 'issuance_smoke_171c';

  try {
    await setupFinalizedUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockOperatorAttestationDraft(unlockPreExecutionFreezeId, 'admin');
    const unlockOperatorAttestationId = draft.tokenRedemptionUnlockOperatorAttestation.activation_token_redemption_unlock_operator_attestation_id;
    console.log(`  Created draft: ${unlockOperatorAttestationId}`);

    const result = await evaluator.evaluateUnlockOperatorAttestation(unlockOperatorAttestationId, {
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

    assert.ok(result);
    assert.strictEqual(result.tokenRedemptionUnlockOperatorAttestation.unlock_operator_attestation_status, 'EVALUATED');
    assert.strictEqual(result.tokenRedemptionUnlockOperatorAttestation.unlock_operator_attestation_result, 'OPERATOR_ATTESTED_NOT_UNLOCKED');
    console.log('  PASS: Evaluator ran successfully with confirmations.');

    const rules = result.rules;
    assert.ok(rules.length >= 12);
    console.log(`  PASS: ${rules.length} rules recorded.`);

    const criticals = rules.filter(r => r.severity === 'CRITICAL');
    assert.strictEqual(criticals.length, 0);
    console.log('  PASS: No CRITICAL rules found — evaluation passed cleanly.');

    assert.strictEqual(result.tokenRedemptionUnlockOperatorAttestation.token_unlock_status, 'NOT_UNLOCKED');
    console.log('  PASS: Token remains locked and not redeemable after successful evaluation.');

    console.log('\nSmoke 171C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 171C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
