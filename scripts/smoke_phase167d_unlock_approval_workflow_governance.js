'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalDecisionService').serviceInstance;
const { setupFinalizedUnlockEligibility, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 167D: Unlock Approval Workflow Governance ===\n');

  const eligibilityId = 'elg_smoke_167d';
  const lockId = 'lock_smoke_167d';
  const finalApvId = 'fapv_smoke_167d';
  const envId = 'env_smoke_167d';
  const authId = 'auth_smoke_167d';
  const readinessId = 'readiness_smoke_167d';
  const issuanceId = 'issuance_smoke_167d';

  try {
    await setupFinalizedUnlockEligibility(eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockApprovalDraft(eligibilityId, 'admin');
    const approvalId = draft.tokenRedemptionUnlockApproval.activation_token_redemption_unlock_approval_id;

    // 1. Block finalization before evaluation
    await assert.rejects(
      decisionSvc.finalizeUnlockApproval(approvalId, 'admin'),
      /UNLOCK_APPROVAL_NOT_DECIDED/
    );
    console.log('  PASS: Finalization blocked before approval.');

    // 2. Evaluate
    await evaluator.evaluateUnlockApproval(approvalId, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true
    }, 'admin');

    // 3. Approve
    const approved = await decisionSvc.recordDecision(approvalId, 'APPROVE', 'Decision recorded in smoke test', 'admin');
    assert.strictEqual(approved.unlock_approval_status, 'APPROVED');
    console.log('  PASS: APPROVE decision recorded.');

    // 4. Finalize
    const finalized = await decisionSvc.finalizeUnlockApproval(approvalId, 'admin');
    assert.strictEqual(finalized.unlock_approval_status, 'FINALIZED');
    console.log('  PASS: Finalized unlock approval successfully.');

    // 5. Block mutations after finalization
    await assert.rejects(
      decisionSvc.recordDecision(approvalId, 'DENY', 'Attempt change finalized', 'admin'),
      /UNLOCK_APPROVAL_IMMUTABLE/
    );
    console.log('  PASS: Mutations blocked after finalization.');

    // 6. Verify security boundary state
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    console.log('  PASS: Token remains locked and not redeemable.');

    console.log('\nSmoke 167D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 167D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
