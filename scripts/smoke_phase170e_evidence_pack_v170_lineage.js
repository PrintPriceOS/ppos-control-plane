'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeEvidencePackService').serviceInstance;
const { setupFinalizedUnlockSeal, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 170E: Evidence Pack v170 Lineage ===\n');

  const unlockSealId = 'seal_smoke_170e';
  const finalReviewId = 'frev_smoke_170e';
  const approvalId = 'apv_smoke_170e';
  const eligibilityId = 'elg_smoke_170e';
  const lockId = 'lock_smoke_170e';
  const finalApvId = 'fapv_smoke_170e';
  const envId = 'env_smoke_170e';
  const authId = 'auth_smoke_170e';
  const readinessId = 'readiness_smoke_170e';
  const issuanceId = 'issuance_smoke_170e';

  try {
    await setupFinalizedUnlockSeal(unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockPreExecutionFreezeDraft(unlockSealId, 'admin');
    const unlockPreExecutionFreezeId = draft.tokenRedemptionUnlockPreExecutionFreeze.activation_token_redemption_unlock_pre_execution_freeze_id;

    await evaluator.evaluateUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, {
      security_officer_unlock_freeze_confirmation: true,
      compliance_officer_unlock_freeze_confirmation: true,
      operations_director_unlock_freeze_confirmation: true,
      rollback_authority_unlock_freeze_confirmation: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    }, 'admin');

    await decisionSvc.recordDecision(unlockPreExecutionFreezeId, 'APPROVE_FREEZE', 'Evidence pack lineage smoke test', 'admin');
    const finalized = await decisionSvc.finalizeUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, 'admin');

    const epResult = await evidenceSvc.generateEvidencePack(finalized, 'admin');
    assert.ok(epResult);
    assert.strictEqual(epResult.evidence_pack_hash, finalized.evidence_pack_hash);
    console.log('  PASS: Evidence pack generated with schema version 170.0.');

    assert.ok(epResult.lineageHashChain);
    assert.ok(epResult.lineageHashChain.phase170_unlock_pre_execution_freeze);
    assert.ok(epResult.lineageHashChain.phase169_unlock_readiness_seal);
    assert.ok(epResult.lineageHashChain.phase168_unlock_final_review);
    assert.ok(epResult.lineageHashChain.phase167_unlock_approval);
    assert.ok(epResult.lineageHashChain.phase166_unlock_eligibility);
    assert.ok(epResult.lineageHashChain.phase165_redemption_lock);
    assert.ok(epResult.lineageHashChain.phase164_redemption_final_approval);
    assert.ok(epResult.lineageHashChain.token_material);
    assert.ok(epResult.lineageHashChain.redemption_package_freeze);
    console.log('  PASS: Lineage recursively contains Phase 169, 168, 167, 166, 165, 164.');

    // Idempotency: Exactly one evidence row exists per pre-execution freeze id.
    const epResult2 = await evidenceSvc.generateEvidencePack(finalized, 'admin');
    assert.strictEqual(epResult2.evidence_pack_hash, epResult.evidence_pack_hash);
    console.log('  PASS: Evidence Pack generation is idempotent.');

    if (isProdLike) {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_pfrz_ev WHERE activation_token_redemption_unlock_pre_execution_freeze_id = ?`,
        [unlockPreExecutionFreezeId]
      );
      assert.strictEqual(rows.length, 1);
      console.log('  PASS: Exactly one evidence row exists per pre-execution freeze id.');
    }

    console.log('\nSmoke 170E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 170E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
