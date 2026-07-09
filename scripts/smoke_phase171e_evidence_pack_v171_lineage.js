'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationEvidencePackService').serviceInstance;
const { setupFinalizedUnlockPreExecutionFreeze, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 171E: Evidence Pack v171 Lineage ===\n');

  const unlockPreExecutionFreezeId = 'freeze_smoke_171e';
  const unlockSealId = 'seal_smoke_171e';
  const finalReviewId = 'frev_smoke_171e';
  const approvalId = 'apv_smoke_171e';
  const eligibilityId = 'elg_smoke_171e';
  const lockId = 'lock_smoke_171e';
  const finalApvId = 'fapv_smoke_171e';
  const envId = 'env_smoke_171e';
  const authId = 'auth_smoke_171e';
  const readinessId = 'readiness_smoke_171e';
  const issuanceId = 'issuance_smoke_171e';

  try {
    await setupFinalizedUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockOperatorAttestationDraft(unlockPreExecutionFreezeId, 'admin');
    const unlockOperatorAttestationId = draft.tokenRedemptionUnlockOperatorAttestation.activation_token_redemption_unlock_operator_attestation_id;

    await evaluator.evaluateUnlockOperatorAttestation(unlockOperatorAttestationId, {
      security_officer_unlock_attestation_confirmation: true,
      compliance_officer_unlock_attestation_confirmation: true,
      operations_director_unlock_attestation_confirmation: true,
      rollback_authority_unlock_attestation_confirmation: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true,
      operator_attestation_confirmed: true
    }, 'admin');

    await decisionSvc.recordDecision(unlockOperatorAttestationId, 'APPROVE_ATTESTATION', 'Evidence pack lineage smoke test', 'admin');
    const finalized = await decisionSvc.finalizeUnlockOperatorAttestation(unlockOperatorAttestationId, 'admin');

    const epResult = await evidenceSvc.generateEvidencePack(finalized, 'admin');
    assert.ok(epResult);
    assert.strictEqual(epResult.evidence_pack_hash, finalized.evidence_pack_hash);
    console.log('  PASS: Evidence pack generated with schema version 171.0.');

    assert.ok(epResult.lineageHashChain);
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
    console.log('  PASS: Lineage recursively contains Phase 170, 169, 168, 167, 166, 165, 164.');

    // Idempotency: Exactly one evidence row exists per operator attestation id.
    const epResult2 = await evidenceSvc.generateEvidencePack(finalized, 'admin');
    assert.strictEqual(epResult2.evidence_pack_hash, epResult.evidence_pack_hash);
    console.log('  PASS: Evidence Pack generation is idempotent.');

    if (isProdLike) {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_oatt_ev WHERE activation_token_redemption_unlock_operator_attestation_id = ?`,
        [unlockOperatorAttestationId]
      );
      assert.strictEqual(rows.length, 1);
      console.log('  PASS: Exactly one evidence row exists per operator attestation id.');
    }

    console.log('\nSmoke 171E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 171E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
