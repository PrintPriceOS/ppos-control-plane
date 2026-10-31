'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalDecisionService').serviceInstance;
const guardrailSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalGuardrailService').serviceInstance;
const { setupFinalizedUnlockEligibility, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 167G: Guardrails & Safety Boundary Scanner ===\n');

  // 1. Verify guardrail scanner
  const scanRes = await guardrailSvc.verifySourceSafety();
  assert.ok(scanRes.passed, 'Guardrail scanner detected forbidden high-risk execution calls!');
  console.log('  PASS: Source code safety scanner found no CRITICAL forbidden execution calls.');

  const eligibilityId = 'elg_smoke_167g';
  const lockId = 'lock_smoke_167g';
  const finalApvId = 'fapv_smoke_167g';
  const envId = 'env_smoke_167g';
  const authId = 'auth_smoke_167g';
  const readinessId = 'readiness_smoke_167g';
  const issuanceId = 'issuance_smoke_167g';

  try {
    await setupFinalizedUnlockEligibility(eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockApprovalDraft(eligibilityId, 'admin');
    const approvalId = draft.tokenRedemptionUnlockApproval.activation_token_redemption_unlock_approval_id;

    await evaluator.evaluateUnlockApproval(approvalId, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true
    }, 'admin');

    await decisionSvc.recordDecision(approvalId, 'APPROVE', 'Guardrails scan verify', 'admin');
    const finalized = await decisionSvc.finalizeUnlockApproval(approvalId, 'admin');

    // 2. Validate Safety Boundaries
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    console.log('  PASS: Token remains non-redeemable / NOT_UNLOCKED after approval finalize.');

    assert.strictEqual(finalized.plan_executable_status, 'NOT_EXECUTABLE');
    console.log('  PASS: Plan remains NOT_EXECUTABLE after approval finalize.');

    assert.strictEqual(finalized.runtime_mutation_status, 'ZERO_RUNTIME_MUTATION_CONFIRMED');
    console.log('  PASS: Runtime mutation confirmed ZERO.');

    assert.strictEqual(finalized.job_creation_status, 'NO_REAL_JOB_CREATED');
    console.log('  PASS: No real job created confirmed.');

    assert.strictEqual(finalized.queue_dispatch_status, 'NO_QUEUE_DISPATCHED');
    console.log('  PASS: No queue dispatched confirmed.');

    console.log('\nSmoke 167G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 167G:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
