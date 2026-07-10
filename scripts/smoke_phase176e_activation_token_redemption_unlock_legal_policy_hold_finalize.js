'use strict';

const assert = require('assert');
const { setupFinalizedUnlockRiskOfficerCountersign, isProdLike } = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldEvaluatorService').serviceInstance;
const decisionService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldDecisionService').serviceInstance;
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 176E: Activation Token Redemption Unlock Legal / Policy Hold Finalize ===');

  const unlockRiskOfficerCountersignId = 'roc_smoke_176e';
  const unlockComplianceWitnessId = 'cwn_smoke_176e';
  const unlockFinalHumanAuthorizationSealId = 'fhas_smoke_176e';
  const unlockDualControlAuthorizationId = 'dcau_smoke_176e';
  const unlockOperatorAttestationId = 'oatt_smoke_176e';
  const unlockPreExecutionFreezeId = 'freeze_smoke_176e';
  const unlockSealId = 'seal_smoke_176e';
  const finalReviewId = 'frev_smoke_176e';
  const approvalId = 'apv_smoke_176e';
  const eligibilityId = 'elig_smoke_176e';
  const lockId = 'lock_smoke_176e';
  const finalApvId = 'fapv_smoke_176e';
  const envId = 'env_smoke_176e';
  const authId = 'auth_smoke_176e';
  const readinessId = 'readiness_smoke_176e';
  const issuanceId = 'issuance_smoke_176e';

  try {
    await setupFinalizedUnlockRiskOfficerCountersign(
      unlockRiskOfficerCountersignId,
      unlockComplianceWitnessId,
      unlockFinalHumanAuthorizationSealId,
      unlockDualControlAuthorizationId,
      unlockOperatorAttestationId,
      unlockPreExecutionFreezeId,
      unlockSealId,
      finalReviewId,
      approvalId,
      eligibilityId,
      lockId,
      finalApvId,
      envId,
      authId,
      readinessId,
      issuanceId
    );

    const draft = await builder.createTokenRedemptionUnlockLegalPolicyHoldDraft(unlockRiskOfficerCountersignId, 'admin');
    const lphId = draft.tokenRedemptionUnlockLegalPolicyHold.act_token_redempt_unlock_legal_policy_hold_id;

    // Record officer
    await decisionService.recordLegalPolicyOfficer(lphId, 'dummy_officer_176e', 'legal_officer', 'Testing finalize', 'admin');

    // Evaluate
    const confirmations = {
      legal_policy_hold_clearance_confirmation: true,
      no_active_legal_hold_confirmed: true,
      no_active_policy_hold_confirmed: true,
      no_active_compliance_freeze_confirmed: true,
      risk_officer_countersign_verified: true,
      compliance_witness_attestation_verified: true,
      final_human_seal_authorizer_unlock_seal_verified: true,
      primary_authorizer_unlock_authorization_verified: true,
      secondary_authorizer_unlock_authorization_verified: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    };
    await evaluator.evaluateUnlockLegalPolicyHold(lphId, confirmations, 'admin');

    // Approve
    await decisionService.recordDecision(lphId, 'APPROVE_LEGAL_POLICY_HOLD', 'Clearance approved', 'admin');

    // Finalize
    const finalized = await decisionService.finalizeUnlockLegalPolicyHold(lphId, 'admin');
    assert.strictEqual(finalized.unlock_legal_policy_hold_status, 'FINALIZED');
    assert.strictEqual(finalized.activation_execution_status, 'UNLOCK_LEGAL_POLICY_HOLD_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED');
    assert.ok(finalized.evidence_pack_hash, 'Evidence pack hash is missing');
    assert.ok(finalized.lineage_hash_chain_json, 'Lineage hash chain is missing');

    const chain = finalized.lineage_hash_chain_json;
    assert.strictEqual(chain.phase176_unlock_legal_policy_hold, finalized.unlock_legal_policy_hold_hash);
    assert.strictEqual(chain.phase175_unlock_risk_officer_countersign, finalized.source_unlock_risk_officer_countersign_hash);

    console.log('  PASS: Finalized unlock legal policy hold successfully with complete lineage back to Phase 164.');

    console.log('\nSmoke 176E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 176E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
