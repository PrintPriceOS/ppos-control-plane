'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalEvidencePackService').serviceInstance;
const { setupFinalizedUnlockEligibility, isProdLike } = require('./smoke_phase166_setup_helper');

(async () => {
  console.log('=== Smoke 167E: Evidence Pack v167 Lineage ===\n');

  const eligibilityId = 'elg_smoke_167e';
  const lockId = 'lock_smoke_167e';
  const finalApvId = 'fapv_smoke_167e';
  const envId = 'env_smoke_167e';
  const authId = 'auth_smoke_167e';
  const readinessId = 'readiness_smoke_167e';
  const issuanceId = 'issuance_smoke_167e';

  try {
    await setupFinalizedUnlockEligibility(eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockApprovalDraft(eligibilityId, 'admin');
    const approvalId = draft.tokenRedemptionUnlockApproval.activation_token_redemption_unlock_approval_id;

    await evaluator.evaluateUnlockApproval(approvalId, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true
    }, 'admin');

    await decisionSvc.recordDecision(approvalId, 'APPROVE', 'Evidence pack lineage smoke test', 'admin');
    const finalized = await decisionSvc.finalizeUnlockApproval(approvalId, 'admin');

    const epResult = await evidenceSvc.generateEvidencePack(finalized, 'admin');
    assert.ok(epResult);
    assert.strictEqual(epResult.evidence_pack_hash, finalized.evidence_pack_hash);
    console.log('  PASS: Evidence pack generated with schema version 167.0.');

    assert.ok(epResult.lineageHashChain);
    assert.ok(epResult.lineageHashChain.phase167_unlock_approval);
    assert.ok(epResult.lineageHashChain.phase166_unlock_eligibility);
    assert.ok(epResult.lineageHashChain.phase165_redemption_lock);
    assert.ok(epResult.lineageHashChain.phase164_redemption_final_approval);
    assert.ok(epResult.lineageHashChain.token_material);
    assert.ok(epResult.lineageHashChain.redemption_package_freeze);
    console.log('  PASS: Lineage recursively contains all parent records.');

    if (isProdLike) {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_apv_ev WHERE activation_token_redemption_unlock_approval_id = ?`,
        [approvalId]
      );
      assert.strictEqual(rows.length, 1);
      console.log('  PASS: Evidence pack record persisted in real DB.');
    }

    console.log('\nSmoke 167E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 167E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
