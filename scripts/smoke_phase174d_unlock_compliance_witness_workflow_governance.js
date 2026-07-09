'use strict';

const assert = require('assert');
const { setupFinalizedUnlockFinalHumanAuthorizationSeal, isProdLike } = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessBuilderService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessDecisionService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessEvaluatorService').serviceInstance;
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 174D: Unlock Compliance Witness Workflow Governance ===');

  const unlockComplianceWitnessId = 'cwn_smoke_174d';
  const unlockFinalHumanAuthorizationSealId = 'fhas_smoke_174d';
  const unlockDualControlAuthorizationId = 'dcau_smoke_174d';
  const unlockOperatorAttestationId = 'oatt_smoke_174d';
  const unlockPreExecutionFreezeId = 'freeze_smoke_174d';
  const unlockSealId = 'seal_smoke_174d';
  const finalReviewId = 'frev_smoke_174d';
  const approvalId = 'apv_smoke_174d';
  const eligibilityId = 'elig_smoke_174d';
  const lockId = 'lock_smoke_174d';
  const finalApvId = 'fapv_smoke_174d';
  const envId = 'env_smoke_174d';
  const authId = 'auth_smoke_174d';
  const readinessId = 'readiness_smoke_174d';
  const issuanceId = 'issuance_smoke_174d';

  try {
    await setupFinalizedUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockComplianceWitnessDraft(unlockFinalHumanAuthorizationSealId, 'admin');
    const tempId = draft.tokenRedemptionUnlockComplianceWitness.act_token_redempt_unlock_compliance_witness_id;

    // 1. Compliance witness duplicating primary authorizer (dummy_alice) must throw
    await assert.rejects(
      decisionSvc.recordComplianceWitness(tempId, 'dummy_alice', 'compliance_officer', 'Duplicate primary', 'admin'),
      /Compliance witness cannot duplicate the primary authorizer/
    );

    // 2. Compliance witness duplicating secondary authorizer (dummy_bob) must throw
    await assert.rejects(
      decisionSvc.recordComplianceWitness(tempId, 'dummy_bob', 'compliance_officer', 'Duplicate secondary', 'admin'),
      /Compliance witness cannot duplicate the secondary authorizer/
    );

    // 3. Compliance witness duplicating final human authorizer (dummy_charlie) must throw
    await assert.rejects(
      decisionSvc.recordComplianceWitness(tempId, 'dummy_charlie', 'compliance_officer', 'Duplicate human seal authorizer', 'admin'),
      /Compliance witness cannot duplicate the final human authorizer/
    );

    console.log('  PASS: Separation of duties enforced. Witness cannot duplicate primary, secondary, or final human authorizers.');

    // 4. Valid independent compliance witness
    await decisionSvc.recordComplianceWitness(tempId, 'user_diana', 'compliance_officer', 'Independent witness checks done', 'admin');

    // 5. Try to finalize before approval must throw
    await assert.rejects(
      decisionSvc.finalizeUnlockComplianceWitness(tempId, 'admin'),
      /Compliance witness record must be APPROVED before finalization/
    );
    console.log('  PASS: Finalization blocked before approval.');

    // 6. Record decision: Approve
    await decisionSvc.recordDecision(tempId, {
      decision: 'APPROVE_COMPLIANCE_WITNESS',
      rationale: 'All checks passed'
    }, 'admin');

    // 7. Finalize
    const finalized = await decisionSvc.finalizeUnlockComplianceWitness(tempId, 'admin');
    assert.strictEqual(finalized.unlock_compliance_witness_status, 'FINALIZED');
    assert.strictEqual(finalized.unlock_compliance_witness_result, 'COMPLIANCE_WITNESSED_NOT_UNLOCKED');
    console.log('  PASS: Finalized unlock compliance witness successfully.');

    // 8. Attempting to record modifications post finalization must throw
    await assert.rejects(
      decisionSvc.recordComplianceWitness(tempId, 'user_diana_new', 'compliance_officer', 'Attempt post-finalize', 'admin'),
      /Compliance witness record is finalized and cannot be modified/
    );

    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    console.log('  PASS: Token remains locked and not redeemable.');

    console.log('\nSmoke 174D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 174D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
