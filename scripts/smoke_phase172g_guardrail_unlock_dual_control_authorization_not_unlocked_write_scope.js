'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationDecisionService').serviceInstance;
const guardrailSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationGuardrailService').serviceInstance;
const { setupFinalizedUnlockOperatorAttestation, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 172G: Guardrails & Safety Boundary Scanner ===\n');

  // 1. Verify guardrail scanner
  const scanRes = await guardrailSvc.verifySourceSafety();
  assert.ok(scanRes.passed, 'Guardrail scanner detected forbidden high-risk execution calls!');
  console.log('  PASS: Source code safety scanner found no CRITICAL forbidden execution calls.');

  const unlockOperatorAttestationId = 'oatt_smoke_172g';
  const unlockPreExecutionFreezeId = 'freeze_smoke_172g';
  const unlockSealId = 'seal_smoke_172g';
  const finalReviewId = 'frev_smoke_172g';
  const approvalId = 'apv_smoke_172g';
  const eligibilityId = 'elg_smoke_172g';
  const lockId = 'lock_smoke_172g';
  const finalApvId = 'fapv_smoke_172g';
  const envId = 'env_smoke_172g';
  const authId = 'auth_smoke_172g';
  const readinessId = 'readiness_smoke_172g';
  const issuanceId = 'issuance_smoke_172g';

  try {
    await setupFinalizedUnlockOperatorAttestation(unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockDualControlAuthorizationDraft(unlockOperatorAttestationId, 'admin');
    const unlockDualControlAuthorizationId = draft.tokenRedemptionUnlockDualControlAuthorization.activation_token_redemption_unlock_dual_control_authorization_id;

    await decisionSvc.recordPrimaryAuthorizer(unlockDualControlAuthorizationId, 'user_alice', 'operations_director');
    await decisionSvc.recordSecondaryAuthorizer(unlockDualControlAuthorizationId, 'user_bob', 'compliance_officer');

    await evaluator.evaluateUnlockDualControlAuthorization(unlockDualControlAuthorizationId, {
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

    await decisionSvc.recordDecision(unlockDualControlAuthorizationId, 'APPROVE_DUAL_CONTROL', 'Guardrails scan verify', 'admin');
    const finalized = await decisionSvc.finalizeUnlockDualControlAuthorization(unlockDualControlAuthorizationId, 'admin');

    // 2. Validate Safety Boundaries
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    console.log('  PASS: Token remains non-redeemable / NOT_UNLOCKED after dual-control finalize.');

    assert.strictEqual(finalized.plan_executable_status, 'NOT_EXECUTABLE');
    console.log('  PASS: Plan remains NOT_EXECUTABLE after dual-control finalize.');

    assert.strictEqual(finalized.runtime_mutation_status, 'ZERO_RUNTIME_MUTATION_CONFIRMED');
    console.log('  PASS: Runtime mutation confirmed ZERO.');

    assert.strictEqual(finalized.job_creation_status, 'NO_REAL_JOB_CREATED');
    console.log('  PASS: No real job created confirmed.');

    assert.strictEqual(finalized.queue_dispatch_status, 'NO_QUEUE_DISPATCHED');
    console.log('  PASS: No queue dispatched confirmed.');

    console.log('\nSmoke 172G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 172G:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
