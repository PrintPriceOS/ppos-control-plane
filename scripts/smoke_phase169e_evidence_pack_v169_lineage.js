'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealEvidencePackService').serviceInstance;
const { setupFinalizedUnlockFinalReview, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 169E: Evidence Pack v169 Lineage ===\n');

  const finalReviewId = 'frev_smoke_169e';
  const approvalId = 'apv_smoke_169e';
  const eligibilityId = 'elg_smoke_169e';
  const lockId = 'lock_smoke_169e';
  const finalApvId = 'fapv_smoke_169e';
  const envId = 'env_smoke_169e';
  const authId = 'auth_smoke_169e';
  const readinessId = 'readiness_smoke_169e';
  const issuanceId = 'issuance_smoke_169e';

  try {
    await setupFinalizedUnlockFinalReview(finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockSealDraft(finalReviewId, 'admin');
    const unlockSealId = draft.tokenRedemptionUnlockSeal.activation_token_redemption_unlock_seal_id;

    await evaluator.evaluateUnlockSeal(unlockSealId, {
      security_officer_confirmation: true,
      compliance_officer_confirmation: true,
      operations_director_confirmation: true,
      rollback_authority_confirmation: true,
      kill_switch_confirmation: true,
      non_execution_confirmation: true,
      final_review_unlock_readiness_confirmation: true,
      seal_authenticity_confirmation: true
    }, 'admin');

    await decisionSvc.recordDecision(unlockSealId, 'APPROVE_SEAL', 'Evidence pack lineage smoke test', 'admin');
    const finalized = await decisionSvc.finalizeUnlockSeal(unlockSealId, 'admin');

    const epResult = await evidenceSvc.generateEvidencePack(finalized, 'admin');
    assert.ok(epResult);
    assert.strictEqual(epResult.evidence_pack_hash, finalized.evidence_pack_hash);
    console.log('  PASS: Evidence pack generated with schema version 169.0.');

    assert.ok(epResult.lineageHashChain);
    assert.ok(epResult.lineageHashChain.phase169_unlock_readiness_seal);
    assert.ok(epResult.lineageHashChain.phase168_unlock_final_review);
    assert.ok(epResult.lineageHashChain.phase167_unlock_approval);
    assert.ok(epResult.lineageHashChain.phase166_unlock_eligibility);
    assert.ok(epResult.lineageHashChain.phase165_redemption_lock);
    assert.ok(epResult.lineageHashChain.phase164_redemption_final_approval);
    assert.ok(epResult.lineageHashChain.token_material);
    assert.ok(epResult.lineageHashChain.redemption_package_freeze);
    console.log('  PASS: Lineage recursively contains all parent records.');

    if (isProdLike) {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_seal_ev WHERE activation_token_redemption_unlock_seal_id = ?`,
        [unlockSealId]
      );
      assert.strictEqual(rows.length, 1);
      console.log('  PASS: Evidence pack record persisted in real DB.');
    }

    console.log('\nSmoke 169E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 169E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
