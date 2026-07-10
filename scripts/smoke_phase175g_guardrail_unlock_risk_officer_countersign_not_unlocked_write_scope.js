'use strict';

const assert = require('assert');
const { setupFinalizedUnlockComplianceWitness, isProdLike } = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignBuilderService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignDecisionService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignEvaluatorService').serviceInstance;
const guardrailSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignGuardrailService').serviceInstance;
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 175G: Guardrails & Safety Boundary Scanner ===');

  const violations = await guardrailSvc.scanForForbiddenOperations();
  assert.strictEqual(violations.length, 0, `Expected zero forbidden execution violations, got: ${JSON.stringify(violations)}`);
  console.log('  PASS: Source code safety scanner found no CRITICAL forbidden execution calls.');

  const unlockComplianceWitnessId = 'cwn_smoke_175g';
  const unlockFinalHumanAuthorizationSealId = 'fhas_smoke_175g';
  const unlockDualControlAuthorizationId = 'dcau_smoke_175g';
  const unlockOperatorAttestationId = 'oatt_smoke_175g';
  const unlockPreExecutionFreezeId = 'freeze_smoke_175g';
  const unlockSealId = 'seal_smoke_175g';
  const finalReviewId = 'frev_smoke_175g';
  const approvalId = 'apv_smoke_175g';
  const eligibilityId = 'elig_smoke_175g';
  const lockId = 'lock_smoke_175g';
  const finalApvId = 'fapv_smoke_175g';
  const envId = 'env_smoke_175g';
  const authId = 'auth_smoke_175g';
  const readinessId = 'readiness_smoke_175g';
  const issuanceId = 'issuance_smoke_175g';

  try {
    await setupFinalizedUnlockComplianceWitness(unlockComplianceWitnessId, unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockRiskOfficerCountersignDraft(unlockComplianceWitnessId, 'admin');
    const tempId = draft.tokenRedemptionUnlockRiskOfficerCountersign.act_token_redempt_unlock_risk_officer_countersign_id;

    await decisionSvc.recordRiskOfficer(tempId, 'user_elena', 'risk_officer', 'Risk officer checks done', 'admin');

    const confirmations = {
      risk_officer_countersign_confirmation: true,
      compliance_witness_attestation_verified: true,
      final_human_seal_authorizer_unlock_seal_verified: true,
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
    };

    await evaluator.evaluateUnlockRiskOfficerCountersign(tempId, confirmations, 'admin');
    await decisionSvc.recordDecision(tempId, 'APPROVE_RISK_COUNTERSIGN', 'All checks passed', 'admin');

    const finalized = await decisionSvc.finalizeUnlockRiskOfficerCountersign(tempId, 'admin');

    // Assert safety boundary states
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    assert.strictEqual(finalized.token_redemption_status, 'LOCKED_NOT_REDEEMED');
    console.log('  PASS: Token remains non-redeemable / NOT_UNLOCKED after risk officer countersign.');

    assert.strictEqual(finalized.plan_executable_status, 'NOT_EXECUTABLE');
    console.log('  PASS: Plan remains NOT_EXECUTABLE after risk officer countersign.');

    assert.strictEqual(finalized.runtime_mutation_status, 'ZERO_RUNTIME_MUTATION_CONFIRMED');
    console.log('  PASS: Runtime mutation confirmed ZERO.');

    assert.strictEqual(finalized.job_creation_status, 'NO_REAL_JOB_CREATED');
    console.log('  PASS: No real job created confirmed.');

    assert.strictEqual(finalized.queue_dispatch_status, 'NO_QUEUE_DISPATCHED');
    console.log('  PASS: No queue dispatched confirmed.');

    console.log('\nSmoke 175G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 175G:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
