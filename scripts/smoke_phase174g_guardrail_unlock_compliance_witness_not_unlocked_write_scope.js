'use strict';

const assert = require('assert');
const { setupFinalizedUnlockFinalHumanAuthorizationSeal, isProdLike } = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessBuilderService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessDecisionService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessEvaluatorService').serviceInstance;
const guardrailSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessGuardrailService').serviceInstance;
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 174G: Guardrails & Safety Boundary Scanner ===');

  const violations = await guardrailSvc.scanForForbiddenOperations();
  assert.strictEqual(violations.length, 0, `Expected zero forbidden execution violations, got: ${JSON.stringify(violations)}`);
  console.log('  PASS: Source code safety scanner found no CRITICAL forbidden execution calls.');

  const unlockComplianceWitnessId = 'cwn_smoke_174g';
  const unlockFinalHumanAuthorizationSealId = 'fhas_smoke_174g';
  const unlockDualControlAuthorizationId = 'dcau_smoke_174g';
  const unlockOperatorAttestationId = 'oatt_smoke_174g';
  const unlockPreExecutionFreezeId = 'freeze_smoke_174g';
  const unlockSealId = 'seal_smoke_174g';
  const finalReviewId = 'frev_smoke_174g';
  const approvalId = 'apv_smoke_174g';
  const eligibilityId = 'elig_smoke_174g';
  const lockId = 'lock_smoke_174g';
  const finalApvId = 'fapv_smoke_174g';
  const envId = 'env_smoke_174g';
  const authId = 'auth_smoke_174g';
  const readinessId = 'readiness_smoke_174g';
  const issuanceId = 'issuance_smoke_174g';

  try {
    await setupFinalizedUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockComplianceWitnessDraft(unlockFinalHumanAuthorizationSealId, 'admin');
    const tempId = draft.tokenRedemptionUnlockComplianceWitness.act_token_redempt_unlock_compliance_witness_id;

    await decisionSvc.recordComplianceWitness(tempId, 'user_diana', 'compliance_officer', 'Compliance witness checks done', 'admin');

    const confirmations = {
      compliance_witness_attestation_confirmation: true,
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

    await evaluator.evaluateUnlockComplianceWitness(tempId, confirmations, 'admin');
    await decisionSvc.recordDecision(tempId, { decision: 'APPROVE_COMPLIANCE_WITNESS' }, 'admin');

    const finalized = await decisionSvc.finalizeUnlockComplianceWitness(tempId, 'admin');

    // Assert safety boundary states
    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    assert.strictEqual(finalized.token_redemption_status, 'LOCKED_NOT_REDEEMED');
    console.log('  PASS: Token remains non-redeemable / NOT_UNLOCKED after compliance witness.');

    assert.strictEqual(finalized.plan_executable_status, 'NOT_EXECUTABLE');
    console.log('  PASS: Plan remains NOT_EXECUTABLE after compliance witness.');

    assert.strictEqual(finalized.runtime_mutation_status, 'ZERO_RUNTIME_MUTATION_CONFIRMED');
    console.log('  PASS: Runtime mutation confirmed ZERO.');

    assert.strictEqual(finalized.job_creation_status, 'NO_REAL_JOB_CREATED');
    console.log('  PASS: No real job created confirmed.');

    assert.strictEqual(finalized.queue_dispatch_status, 'NO_QUEUE_DISPATCHED');
    console.log('  PASS: No queue dispatched confirmed.');

    console.log('\nSmoke 174G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 174G:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
