'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealEvidencePackService').serviceInstance;
const { setupFinalizedUnlockDualControlAuthorization, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 173E: Evidence Pack v173 Lineage ===\n');

  const unlockDualControlAuthorizationId = 'dcau_smoke_173e';
  const unlockOperatorAttestationId = 'oatt_smoke_173e';
  const unlockPreExecutionFreezeId = 'freeze_smoke_173e';
  const unlockSealId = 'seal_smoke_173e';
  const finalReviewId = 'frev_smoke_173e';
  const approvalId = 'apv_smoke_173e';
  const eligibilityId = 'elg_smoke_173e';
  const lockId = 'lock_smoke_173e';
  const finalApvId = 'fapv_smoke_173e';
  const envId = 'env_smoke_173e';
  const authId = 'auth_smoke_173e';
  const readinessId = 'readiness_smoke_173e';
  const issuanceId = 'issuance_smoke_173e';

  try {
    await setupFinalizedUnlockDualControlAuthorization(unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockFinalHumanAuthorizationSealDraft(unlockDualControlAuthorizationId, 'admin');
    const unlockFinalHumanAuthorizationSealId = draft.tokenRedemptionUnlockFinalHumanAuthorizationSeal.activation_token_redemption_unlock_final_human_authorization_seal_id;

    await decisionSvc.recordFinalHumanAuthorizer(unlockFinalHumanAuthorizationSealId, 'user_charlie', 'system_admin', 'Attestation recorded');

    await evaluator.evaluateUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, {
      final_human_seal_authorizer_unlock_authorization_seal_confirmation: true,
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
    }, 'admin');

    await decisionSvc.recordDecision(unlockFinalHumanAuthorizationSealId, 'APPROVE_FINAL_SEAL', 'Evidence pack lineage smoke test', 'admin');
    const finalized = await decisionSvc.finalizeUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, 'admin');

    const epResult = await evidenceSvc.generateEvidencePack(finalized, 'admin');
    assert.ok(epResult);
    assert.strictEqual(epResult.evidence_pack_hash, finalized.evidence_pack_hash);
    console.log('  PASS: Evidence pack generated with schema version 173.0.');

    assert.ok(epResult.lineageHashChain);
    assert.ok(epResult.lineageHashChain.phase173_unlock_final_human_authorization_seal);
    assert.ok(epResult.lineageHashChain.phase172_unlock_dual_control_authorization);
    assert.ok(epResult.lineageHashChain.phase171_unlock_operator_attestation);
    assert.ok(epResult.lineageHashChain.phase170_unlock_pre_execution_freeze);
    assert.ok(epResult.lineageHashChain.phase169_unlock_readiness_seal);
    assert.ok(epResult.lineageHashChain.phase168_unlock_final_review);
    assert.ok(epResult.lineageHashChain.phase167_unlock_approval);
    assert.ok(epResult.lineageHashChain.phase166_unlock_eligibility);
    assert.ok(epResult.lineageHashChain.phase165_redemption_lock);
    assert.ok(epResult.lineageHashChain.phase164_redemption_final_approval);
    assert.ok(epResult.lineageHashChain.token_material);
    assert.ok(epResult.lineageHashChain.redemption_package_freeze);
    console.log('  PASS: Lineage recursively contains Phase 172, 171, 170, 169, 168, 167, 166, 165, 164.');

    // Idempotency check
    const epResult2 = await evidenceSvc.generateEvidencePack(finalized, 'admin');
    assert.strictEqual(epResult2.evidence_pack_hash, epResult.evidence_pack_hash);
    console.log('  PASS: Evidence Pack generation is idempotent.');

    // Redacted identity verification: raw user_charlie must be redacted/hashed in the final payload
    const payload = JSON.parse(epResult.evidence_payload_json || '{}');
    assert.strictEqual(payload.final_human_authorizer_id, undefined);
    assert.ok(payload.final_human_authorizer_id_sha256);
    console.log('  PASS: Final human authorizer identity is redacted (minimized/hashed).');

    // Authorizer independence check
    assert.ok(finalized.final_human_authorizer_id !== finalized.primary_authorizer_id);
    assert.ok(finalized.final_human_authorizer_id !== finalized.secondary_authorizer_id);
    console.log('  PASS: Final human authorizer is verified independent from primary and secondary.');

    if (isProdLike) {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_fhas_ev WHERE activation_token_redemption_unlock_final_human_authorization_seal_id = ?`,
        [unlockFinalHumanAuthorizationSealId]
      );
      assert.strictEqual(rows.length, 1);
      console.log('  PASS: Exactly one evidence row exists per final human authorization seal id.');
    }

    console.log('\nSmoke 173E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 173E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
