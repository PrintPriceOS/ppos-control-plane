'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealDecisionService').serviceInstance;
const { setupFinalizedUnlockDualControlAuthorization, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 173C: Activation Token Redemption Unlock Final Human Authorization Seal Evaluator Rules ===\n');

  const unlockDualControlAuthorizationId = 'dcau_smoke_173c';
  const unlockOperatorAttestationId = 'oatt_smoke_173c';
  const unlockPreExecutionFreezeId = 'freeze_smoke_173c';
  const unlockSealId = 'seal_smoke_173c';
  const finalReviewId = 'frev_smoke_173c';
  const approvalId = 'apv_smoke_173c';
  const eligibilityId = 'elg_smoke_173c';
  const lockId = 'lock_smoke_173c';
  const finalApvId = 'fapv_smoke_173c';
  const envId = 'env_smoke_173c';
  const authId = 'auth_smoke_173c';
  const readinessId = 'readiness_smoke_173c';
  const issuanceId = 'issuance_smoke_173c';

  try {
    await setupFinalizedUnlockDualControlAuthorization(unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockFinalHumanAuthorizationSealDraft(unlockDualControlAuthorizationId, 'admin');
    const unlockFinalHumanAuthorizationSealId = draft.tokenRedemptionUnlockFinalHumanAuthorizationSeal.act_token_redempt_unlock_final_human_authorization_seal_id;

    // 1. Record final human authorizer
    await decisionSvc.recordFinalHumanAuthorizer(unlockFinalHumanAuthorizationSealId, 'user_charlie', 'system_admin', 'Attested by Charlie');

    const result = await evaluator.evaluateUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, {
      final_human_seal_authorizer_unlock_authorization_seal_confirmation: true,
      primary_authorizer_unlock_authorization_verified: true,
      secondary_authorizer_unlock_authorization_verified: true,
      security_officer_unlock_attestation_verified: true,
      compliance_officer_unlock_attestation_verified: true,
      operations_director_unlock_attestation_verified: true,
      rollback_authority_unlock_attestation_verified: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    }, 'admin');

    assert.ok(result);
    assert.strictEqual(result.tokenRedemptionUnlockFinalHumanAuthorizationSeal.unlock_final_human_authorization_seal_status, 'EVALUATED');
    assert.strictEqual(result.tokenRedemptionUnlockFinalHumanAuthorizationSeal.unlock_final_human_authorization_seal_result, 'FINAL_HUMAN_AUTHORIZATION_SEALED_NOT_UNLOCKED');
    console.log('  PASS: Evaluator ran successfully with 12 confirmations.');

    const rules = result.rules;
    assert.ok(rules.length >= 17);
    console.log(`  PASS: ${rules.length} rules recorded.`);

    const criticals = rules.filter(r => r.severity === 'CRITICAL');
    assert.strictEqual(criticals.length, 0);
    console.log('  PASS: No CRITICAL rules found — evaluation passed cleanly.');

    console.log('\nSmoke 173C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 173C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
