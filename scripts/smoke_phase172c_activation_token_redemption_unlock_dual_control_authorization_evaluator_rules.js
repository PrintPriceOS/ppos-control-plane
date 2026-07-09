'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationDecisionService').serviceInstance;
const { setupFinalizedUnlockOperatorAttestation, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 172C: Activation Token Redemption Unlock Dual-Control Authorization Evaluator Rules ===\n');

  const unlockOperatorAttestationId = 'oatt_smoke_172c';
  const unlockPreExecutionFreezeId = 'freeze_smoke_172c';
  const unlockSealId = 'seal_smoke_172c';
  const finalReviewId = 'frev_smoke_172c';
  const approvalId = 'apv_smoke_172c';
  const eligibilityId = 'elg_smoke_172c';
  const lockId = 'lock_smoke_172c';
  const finalApvId = 'fapv_smoke_172c';
  const envId = 'env_smoke_172c';
  const authId = 'auth_smoke_172c';
  const readinessId = 'readiness_smoke_172c';
  const issuanceId = 'issuance_smoke_172c';

  try {
    await setupFinalizedUnlockOperatorAttestation(unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockDualControlAuthorizationDraft(unlockOperatorAttestationId, 'admin');
    const unlockDualControlAuthorizationId = draft.tokenRedemptionUnlockDualControlAuthorization.activation_token_redemption_unlock_dual_control_authorization_id;

    // 1. Record primary and secondary authorizers
    await decisionSvc.recordPrimaryAuthorizer(unlockDualControlAuthorizationId, 'user_alice', 'operations_director');
    await decisionSvc.recordSecondaryAuthorizer(unlockDualControlAuthorizationId, 'user_bob', 'compliance_officer');

    const result = await evaluator.evaluateUnlockDualControlAuthorization(unlockDualControlAuthorizationId, {
      primary_authorizer_unlock_authorization_confirmation: true,
      secondary_authorizer_unlock_authorization_confirmation: true,
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
    assert.strictEqual(result.tokenRedemptionUnlockDualControlAuthorization.unlock_dual_control_authorization_status, 'EVALUATED');
    assert.strictEqual(result.tokenRedemptionUnlockDualControlAuthorization.unlock_dual_control_authorization_result, 'DUAL_CONTROL_AUTHORIZED_NOT_UNLOCKED');
    console.log('  PASS: Evaluator ran successfully with confirmations.');

    const rules = result.rules;
    assert.ok(rules.length >= 14);
    console.log(`  PASS: ${rules.length} rules recorded.`);

    const criticals = rules.filter(r => r.severity === 'CRITICAL');
    assert.strictEqual(criticals.length, 0);
    console.log('  PASS: No CRITICAL rules found — evaluation passed cleanly.');

    console.log('\nSmoke 172C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 172C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
