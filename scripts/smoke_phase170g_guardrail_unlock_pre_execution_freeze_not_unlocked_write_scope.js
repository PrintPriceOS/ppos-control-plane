'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeDecisionService').serviceInstance;
const guardrailSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeGuardrailService').serviceInstance;
const { setupFinalizedUnlockSeal, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 170G: Guardrails & Safety Boundary Scanner ===\n');

  // 1. Verify guardrail scanner
  const scanRes = await guardrailSvc.verifySourceSafety();
  assert.ok(scanRes.passed, 'Guardrail scanner detected forbidden high-risk execution calls!');
  console.log('  PASS: Source code safety scanner found no CRITICAL forbidden execution calls.');

  const unlockSealId = 'seal_smoke_170g';
  const finalReviewId = 'frev_smoke_170g';
  const approvalId = 'apv_smoke_170g';
  const eligibilityId = 'elg_smoke_170g';
  const lockId = 'lock_smoke_170g';
  const finalApvId = 'fapv_smoke_170g';
  const envId = 'env_smoke_170g';
  const authId = 'auth_smoke_170g';
  const readinessId = 'readiness_smoke_170g';
  const issuanceId = 'issuance_smoke_170g';

  try {
    await setupFinalizedUnlockSeal(unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockPreExecutionFreezeDraft(unlockSealId, 'admin');
    const unlockPreExecutionFreezeId = draft.tokenRedemptionUnlockPreExecutionFreeze.activation_token_redemption_unlock_pre_execution_freeze_id;

    await evaluator.evaluateUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, {
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

    await decisionSvc.recordDecision(unlockPreExecutionFreezeId, 'APPROVE_FREEZE', 'Guardrails scan verify', 'admin');
    const finalized = await decisionSvc.finalizeUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, 'admin');

    // 2. Validate Safety Boundaries
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    console.log('  PASS: Token remains non-redeemable / NOT_UNLOCKED after freeze finalize.');

    assert.strictEqual(finalized.plan_executable_status, 'NOT_EXECUTABLE');
    console.log('  PASS: Plan remains NOT_EXECUTABLE after freeze finalize.');

    assert.strictEqual(finalized.runtime_mutation_status, 'ZERO_RUNTIME_MUTATION_CONFIRMED');
    console.log('  PASS: Runtime mutation confirmed ZERO.');

    assert.strictEqual(finalized.job_creation_status, 'NO_REAL_JOB_CREATED');
    console.log('  PASS: No real job created confirmed.');

    assert.strictEqual(finalized.queue_dispatch_status, 'NO_QUEUE_DISPATCHED');
    console.log('  PASS: No queue dispatched confirmed.');

    console.log('\nSmoke 170G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 170G:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
