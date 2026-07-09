'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealDecisionService').serviceInstance;
const guardrailSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealGuardrailService').serviceInstance;
const { setupFinalizedUnlockDualControlAuthorization, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 173G: Guardrails & Safety Boundary Scanner ===\n');

  // 1. Verify guardrail scanner
  const scanRes = await guardrailSvc.verifySourceSafety();
  assert.ok(scanRes.passed, 'Guardrail scanner detected forbidden high-risk execution calls!');
  console.log('  PASS: Source code safety scanner found no CRITICAL forbidden execution calls.');

  const unlockDualControlAuthorizationId = 'dcau_smoke_173g';
  const unlockOperatorAttestationId = 'oatt_smoke_173g';
  const unlockPreExecutionFreezeId = 'freeze_smoke_173g';
  const unlockSealId = 'seal_smoke_173g';
  const finalReviewId = 'frev_smoke_173g';
  const approvalId = 'apv_smoke_173g';
  const eligibilityId = 'elg_smoke_173g';
  const lockId = 'lock_smoke_173g';
  const finalApvId = 'fapv_smoke_173g';
  const envId = 'env_smoke_173g';
  const authId = 'auth_smoke_173g';
  const readinessId = 'readiness_smoke_173g';
  const issuanceId = 'issuance_smoke_173g';

  try {
    await setupFinalizedUnlockDualControlAuthorization(unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockFinalHumanAuthorizationSealDraft(unlockDualControlAuthorizationId, 'admin');
    const unlockFinalHumanAuthorizationSealId = draft.tokenRedemptionUnlockFinalHumanAuthorizationSeal.activation_token_redemption_unlock_final_human_authorization_seal_id;

    await decisionSvc.recordFinalHumanAuthorizer(unlockFinalHumanAuthorizationSealId, 'user_charlie', 'system_admin', 'Attestation recorded');

    await evaluator.evaluateUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, {
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

    await decisionSvc.recordDecision(unlockFinalHumanAuthorizationSealId, 'APPROVE_FINAL_SEAL', 'Guardrails scan verify', 'admin');
    const finalized = await decisionSvc.finalizeUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, 'admin');

    // 2. Validate Safety Boundaries
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    console.log('  PASS: Token remains non-redeemable / NOT_UNLOCKED after final human seal.');

    assert.strictEqual(finalized.plan_executable_status, 'NOT_EXECUTABLE');
    console.log('  PASS: Plan remains NOT_EXECUTABLE after final human seal.');

    assert.strictEqual(finalized.runtime_mutation_status, 'ZERO_RUNTIME_MUTATION_CONFIRMED');
    console.log('  PASS: Runtime mutation confirmed ZERO.');

    assert.strictEqual(finalized.job_creation_status, 'NO_REAL_JOB_CREATED');
    console.log('  PASS: No real job created confirmed.');

    assert.strictEqual(finalized.queue_dispatch_status, 'NO_QUEUE_DISPATCHED');
    console.log('  PASS: No queue dispatched confirmed.');

    console.log('\nSmoke 173G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 173G:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
