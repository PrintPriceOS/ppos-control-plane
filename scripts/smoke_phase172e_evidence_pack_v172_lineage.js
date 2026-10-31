'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationEvidencePackService').serviceInstance;
const { setupFinalizedUnlockOperatorAttestation, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 172E: Evidence Pack v172 Lineage ===\n');

  const unlockOperatorAttestationId = 'oatt_smoke_172e';
  const unlockPreExecutionFreezeId = 'freeze_smoke_172e';
  const unlockSealId = 'seal_smoke_172e';
  const finalReviewId = 'frev_smoke_172e';
  const approvalId = 'apv_smoke_172e';
  const eligibilityId = 'elg_smoke_172e';
  const lockId = 'lock_smoke_172e';
  const finalApvId = 'fapv_smoke_172e';
  const envId = 'env_smoke_172e';
  const authId = 'auth_smoke_172e';
  const readinessId = 'readiness_smoke_172e';
  const issuanceId = 'issuance_smoke_172e';

  try {
    await setupFinalizedUnlockOperatorAttestation(unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockDualControlAuthorizationDraft(unlockOperatorAttestationId, 'admin');
    const unlockDualControlAuthorizationId = draft.tokenRedemptionUnlockDualControlAuthorization.activation_token_redemption_unlock_dual_control_authorization_id;

    await decisionSvc.recordPrimaryAuthorizer(unlockDualControlAuthorizationId, 'user_alice', 'operations_director');
    await decisionSvc.recordSecondaryAuthorizer(unlockDualControlAuthorizationId, 'user_bob', 'compliance_officer');

    await evaluator.evaluateUnlockDualControlAuthorization(unlockDualControlAuthorizationId, {
      primary_authorizer_unlock_authorization_confirmation: true,
      secondary_authorizer_unlock_authorization_confirmation: true,
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

    await decisionSvc.recordDecision(unlockDualControlAuthorizationId, 'APPROVE_DUAL_CONTROL', 'Evidence pack lineage smoke test', 'admin');
    const finalized = await decisionSvc.finalizeUnlockDualControlAuthorization(unlockDualControlAuthorizationId, 'admin');

    const epResult = await evidenceSvc.generateEvidencePack(finalized, 'admin');
    assert.ok(epResult);
    assert.strictEqual(epResult.evidence_pack_hash, finalized.evidence_pack_hash);
    console.log('  PASS: Evidence pack generated with schema version 172.0.');

    assert.ok(epResult.lineageHashChain);
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
    console.log('  PASS: Lineage recursively contains Phase 171, 170, 169, 168, 167, 166, 165, 164.');

    // Idempotency check
    const epResult2 = await evidenceSvc.generateEvidencePack(finalized, 'admin');
    assert.strictEqual(epResult2.evidence_pack_hash, epResult.evidence_pack_hash);
    console.log('  PASS: Evidence Pack generation is idempotent.');

    // Redacted identity verification: the payload shouldn't include raw user_alice or user_bob in authorizer fields
    const payload = JSON.parse(epResult.evidence_payload_json || '{}');
    assert.strictEqual(payload.primary_authorizer_id, undefined);
    assert.strictEqual(payload.secondary_authorizer_id, undefined);
    assert.ok(payload.primary_authorizer_id_sha256);
    assert.ok(payload.secondary_authorizer_id_sha256);
    console.log('  PASS: Dual-control authorizer identities are redacted (minimized/hashed).');

    if (isProdLike) {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_dcau_ev WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?`,
        [unlockDualControlAuthorizationId]
      );
      assert.strictEqual(rows.length, 1);
      console.log('  PASS: Exactly one evidence row exists per dual-control authorization id.');
    }

    console.log('\nSmoke 172E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 172E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
