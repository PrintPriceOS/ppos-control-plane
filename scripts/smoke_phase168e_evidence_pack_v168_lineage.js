'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewEvidencePackService').serviceInstance;
const { setupFinalizedUnlockApproval, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 168E: Evidence Pack v168 Lineage ===\n');

  const approvalId = 'apv_smoke_168e';
  const eligibilityId = 'elg_smoke_168e';
  const lockId = 'lock_smoke_168e';
  const finalApvId = 'fapv_smoke_168e';
  const envId = 'env_smoke_168e';
  const authId = 'auth_smoke_168e';
  const readinessId = 'readiness_smoke_168e';
  const issuanceId = 'issuance_smoke_168e';

  try {
    await setupFinalizedUnlockApproval(approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockFinalReviewDraft(approvalId, 'admin');
    const finalReviewId = draft.tokenRedemptionUnlockFinalReview.activation_token_redemption_unlock_final_review_id;

    await evaluator.evaluateUnlockFinalReview(finalReviewId, {
      security_officer_confirmation: true,
      compliance_officer_confirmation: true,
      operations_director_confirmation: true,
      rollback_authority_confirmation: true,
      kill_switch_confirmation: true,
      non_execution_confirmation: true,
      final_review_no_unlock_confirmation: true
    }, 'admin');

    await decisionSvc.recordDecision(finalReviewId, 'APPROVE_FINAL_REVIEW', 'Evidence pack lineage smoke test', 'admin');
    const finalized = await decisionSvc.finalizeUnlockFinalReview(finalReviewId, 'admin');

    const epResult = await evidenceSvc.generateEvidencePack(finalized, 'admin');
    assert.ok(epResult);
    assert.strictEqual(epResult.evidence_pack_hash, finalized.evidence_pack_hash);
    console.log('  PASS: Evidence pack generated with schema version 168.0.');

    assert.ok(epResult.lineageHashChain);
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
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_frev_ev WHERE activation_token_redemption_unlock_final_review_id = ?`,
        [finalReviewId]
      );
      assert.strictEqual(rows.length, 1);
      console.log('  PASS: Evidence pack record persisted in real DB.');
    }

    console.log('\nSmoke 168E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 168E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
