'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const finalApvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalBuilderService').serviceInstance;
const envBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionLockDecisionService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

function seedFinalApprovalMock(finalApvId, envId) {
  const config = { redemption_lock_mode: 'TOKEN_REDEMPTION_LOCK_PRE_REDEMPTION_FREEZE_ONLY', token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE', token_redeemable: false };
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase164_tables: true, wrote_phase128_to_163_operational_tables: false };
  envBuilder._mockState.tokenRedemptionEnvelope.set(envId, {
    activation_token_redemption_env_id: envId,
    activation_token_redemption_envelope_status: 'FINALIZED',
    activation_token_redemption_envelope_hash: 'env_hash_165d'
  });
  envBuilder._mockState.rules.set(envId, []);
  finalApvBuilder._mockState.tokenRedemptionFinalApproval.set(finalApvId, {
    activation_token_redemption_final_apv_id: finalApvId,
    source_activation_token_redemption_env_id: envId,
    activation_token_redemption_final_apv_status: 'FINALIZED',
    activation_token_redemption_final_apv_result: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_REDEMPTION_FINAL_APPROVAL_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED', activation_token_redemption_final_apv_hash: 'fapv_hash_165d',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0, rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0, guardrail_status: 'PASS', write_scope_status: 'PASS',
    canary_envelope_json: config, non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE', token_redeemable_status: 'NOT_REDEEMABLE',
    token_redemption_status: 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED'
  });
  finalApvBuilder._mockState.rules.set(finalApvId, []);
}

(async () => {
  console.log('=== Smoke 165D: Activation Token Redemption Lock Workflow Governance ===\n');

  try {
    const finalApvId = 'atfa_165d_1';
    const envId = 'ate_165d_1';

    if (!isProdLike) {
      seedFinalApprovalMock(finalApvId, envId);
    }

    // 1. Create draft
    const draft = await builder.createTokenRedemptionLockDraft(finalApvId, 'admin');
    const lockId = draft.tokenRedemptionLock.activation_token_redemption_lock_id;
    console.log('  PASS: Draft lock created.');

    // 2. Cannot decide before evaluating
    await assert.rejects(
      decisionSvc.recordDecision(lockId, 'APPROVE', 'test', 'admin'),
      /DECISION_BLOCKED/
    );
    console.log('  PASS: Decision blocked before evaluation.');

    // 3. Evaluate
    await evaluator.evaluateTokenRedemptionLock(lockId, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true,
      operations_director_confirmed: true
    }, 'admin');
    console.log('  PASS: Lock evaluated.');

    // 4. Record APPROVE decision
    const decisionResult = await decisionSvc.recordDecision(lockId, 'APPROVE', 'All pre-redemption checks passed.', 'admin');
    assert.ok(decisionResult);
    const lockAfterDecision = await builder.getTokenRedemptionLock(lockId);
    assert.strictEqual(lockAfterDecision.activation_token_redemption_lock_status, 'APPROVED');
    console.log('  PASS: APPROVE decision recorded, status is APPROVED.');

    // 5. Finalize
    const finalResult = await decisionSvc.finalizeRedemptionLock(lockId, 'admin');
    assert.ok(finalResult);
    const lockAfterFinalize = await builder.getTokenRedemptionLock(lockId);
    assert.strictEqual(lockAfterFinalize.activation_token_redemption_lock_status, 'FINALIZED');
    console.log('  PASS: Lock finalized, status is FINALIZED.');

    // 6. Cannot finalize again
    await assert.rejects(
      decisionSvc.finalizeRedemptionLock(lockId, 'admin'),
      /LOCK_IMMUTABLE/
    );
    console.log('  PASS: Correctly blocked re-finalization (immutable after finalize).');

    // 7. Verify safety boundary — token remains NOT_REDEEMABLE
    const finalLock = await builder.getTokenRedemptionLock(lockId);
    assert.ok(
      !finalLock.token_redeemable_status || finalLock.token_redeemable_status === 'NOT_REDEEMABLE',
      'Token must remain NOT_REDEEMABLE after lock'
    );
    console.log('  PASS: Token remains NOT_REDEEMABLE after finalize.');

    console.log('\nSmoke 165D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 165D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
