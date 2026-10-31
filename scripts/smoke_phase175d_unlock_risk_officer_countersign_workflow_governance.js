'use strict';

const assert = require('assert');
const { setupFinalizedUnlockComplianceWitness, isProdLike } = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignBuilderService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignDecisionService').serviceInstance;
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 175D: Unlock Risk Officer Countersign Workflow Governance ===');

  const unlockComplianceWitnessId = 'cwn_smoke_175d';
  const unlockFinalHumanAuthorizationSealId = 'fhas_smoke_175d';
  const unlockDualControlAuthorizationId = 'dcau_smoke_175d';
  const unlockOperatorAttestationId = 'oatt_smoke_175d';
  const unlockPreExecutionFreezeId = 'freeze_smoke_175d';
  const unlockSealId = 'seal_smoke_175d';
  const finalReviewId = 'frev_smoke_175d';
  const approvalId = 'apv_smoke_175d';
  const eligibilityId = 'elig_smoke_175d';
  const lockId = 'lock_smoke_175d';
  const finalApvId = 'fapv_smoke_175d';
  const envId = 'env_smoke_175d';
  const authId = 'auth_smoke_175d';
  const readinessId = 'readiness_smoke_175d';
  const issuanceId = 'issuance_smoke_175d';

  try {
    await setupFinalizedUnlockComplianceWitness(unlockComplianceWitnessId, unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockRiskOfficerCountersignDraft(unlockComplianceWitnessId, 'admin');
    const tempId = draft.tokenRedemptionUnlockRiskOfficerCountersign.act_token_redempt_unlock_risk_officer_countersign_id;

    // 1. Risk Officer duplicating primary authorizer (dummy_alice) must throw
    await assert.rejects(
      decisionSvc.recordRiskOfficer(tempId, 'dummy_alice', 'risk_officer', 'Duplicate primary', 'admin'),
      /Risk Officer cannot duplicate the primary authorizer/
    );

    // 2. Risk Officer duplicating secondary authorizer (dummy_bob) must throw
    await assert.rejects(
      decisionSvc.recordRiskOfficer(tempId, 'dummy_bob', 'risk_officer', 'Duplicate secondary', 'admin'),
      /Risk Officer cannot duplicate the secondary authorizer/
    );

    // 3. Risk Officer duplicating final human authorizer (dummy_charlie) must throw
    await assert.rejects(
      decisionSvc.recordRiskOfficer(tempId, 'dummy_charlie', 'risk_officer', 'Duplicate human seal authorizer', 'admin'),
      /Risk Officer cannot duplicate the final human authorizer/
    );

    // 4. Risk Officer duplicating compliance witness (dummy_diana) must throw
    await assert.rejects(
      decisionSvc.recordRiskOfficer(tempId, 'dummy_diana', 'risk_officer', 'Duplicate compliance witness', 'admin'),
      /Risk Officer cannot duplicate the compliance witness/
    );

    console.log('  PASS: Separation of duties enforced. Risk Officer is verified independent.');

    // 5. Valid independent Risk Officer
    await decisionSvc.recordRiskOfficer(tempId, 'user_elena', 'risk_officer', 'Independent risk checks done', 'admin');

    // 6. Try to finalize before approval must throw
    await assert.rejects(
      decisionSvc.finalizeUnlockRiskOfficerCountersign(tempId, 'admin'),
      /Risk officer countersign record must be APPROVED before finalization/
    );
    console.log('  PASS: Finalization blocked before approval.');

    const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignEvaluatorService').serviceInstance;
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

    // 7. Record decision: Approve
    await decisionSvc.recordDecision(tempId, 'APPROVE_RISK_COUNTERSIGN', 'All checks passed', 'admin');

    // 8. Finalize
    const finalized = await decisionSvc.finalizeUnlockRiskOfficerCountersign(tempId, 'admin');
    assert.strictEqual(finalized.unlock_risk_officer_countersign_status, 'FINALIZED');
    assert.strictEqual(finalized.unlock_risk_officer_countersign_result, 'RISK_OFFICER_COUNTERSIGNED_NOT_UNLOCKED');
    console.log('  PASS: Finalized unlock risk officer countersign successfully.');

    // 9. Attempting to record modifications post finalization must throw
    await assert.rejects(
      decisionSvc.recordRiskOfficer(tempId, 'user_elena_new', 'risk_officer', 'Attempt post-finalize', 'admin'),
      /Risk officer countersign record is finalized and cannot be modified/
    );

    assert.strictEqual(finalized.token_unlock_status, 'NOT_UNLOCKED');
    assert.strictEqual(finalized.token_redeemable_status, 'NOT_REDEEMABLE');
    console.log('  PASS: Token remains locked and not redeemable.');

    console.log('\nSmoke 175D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 175D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
