'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealDecisionService').serviceInstance;
const guardrailSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealGuardrailService').serviceInstance;
const { setupFinalizedUnlockFinalReview, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 169G: Guardrails & Safety Boundary Scanner ===\n');

  // 1. Verify guardrail scanner
  const scanRes = await guardrailSvc.verifySourceSafety();
  assert.ok(scanRes.passed, 'Guardrail scanner detected forbidden high-risk execution calls!');
  console.log('  PASS: Source code safety scanner found no CRITICAL forbidden execution calls.');

  const finalReviewId = 'frev_smoke_169g';
  const approvalId = 'apv_smoke_169g';
  const eligibilityId = 'elg_smoke_169g';
  const lockId = 'lock_smoke_169g';
  const finalApvId = 'fapv_smoke_169g';
  const envId = 'env_smoke_169g';
  const authId = 'auth_smoke_169g';
  const readinessId = 'readiness_smoke_169g';
  const issuanceId = 'issuance_smoke_169g';

  try {
    await setupFinalizedUnlockFinalReview(finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockSealDraft(finalReviewId, 'admin');
    const unlockSealId = draft.tokenRedemptionUnlockSeal.activation_token_redemption_unlock_seal_id;

    await evaluator.evaluateUnlockSeal(unlockSealId, {
      security_officer_confirmation: true,
      compliance_officer_confirmation: true,
      operations_director_confirmation: true,
      rollback_authority_confirmation: true,
      kill_switch_confirmation: true,
      non_execution_confirmation: true,
      final_review_unlock_readiness_confirmation: true,
      seal_authenticity_confirmation: true
    }, 'admin');

    await decisionSvc.recordDecision(unlockSealId, 'APPROVE_SEAL', 'Guardrails scan verify', 'admin');
    const finalized = await decisionSvc.finalizeUnlockSeal(unlockSealId, 'admin');

    // 2. Validate Safety Boundaries
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    console.log('  PASS: Token remains non-redeemable / NOT_UNLOCKED after seal finalize.');

    assert.strictEqual(finalized.plan_executable_status, 'NOT_EXECUTABLE');
    console.log('  PASS: Plan remains NOT_EXECUTABLE after seal finalize.');

    assert.strictEqual(finalized.runtime_mutation_status, 'ZERO_RUNTIME_MUTATION_CONFIRMED');
    console.log('  PASS: Runtime mutation confirmed ZERO.');

    assert.strictEqual(finalized.job_creation_status, 'NO_REAL_JOB_CREATED');
    console.log('  PASS: No real job created confirmed.');

    assert.strictEqual(finalized.queue_dispatch_status, 'NO_QUEUE_DISPATCHED');
    console.log('  PASS: No queue dispatched confirmed.');

    console.log('\nSmoke 169G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 169G:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
