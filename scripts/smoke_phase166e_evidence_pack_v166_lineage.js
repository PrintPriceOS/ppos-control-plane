'use strict';

const assert = require('assert');
const { setupFinalizedRedemptionLock, isProdLike } = require('./smoke_phase166_setup_helper');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityEvidencePackService').serviceInstance;

(async () => {
  console.log('=== Smoke 166E: Evidence Pack v166 Lineage ===\n');

  try {
    const lockId = 'atl_166e_1';
    const finalApvId = 'atfa_166e_1';
    const envId = 'ate_166e_1';
    const authId = 'ata_166e_1';
    const readinessId = 'atr_166e_1';
    const issuanceId = 'ati_166e_1';

    await setupFinalizedRedemptionLock(lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockEligibilityDraft(lockId, 'admin');
    const eligibilityId = draft.tokenRedemptionUnlockEligibility.activation_token_redemption_unlock_eligibility_id;

    await evaluator.evaluateUnlockEligibility(eligibilityId, {
      security_officer_confirmed: true,
      compliance_officer_confirmed: true
    }, 'admin');

    await decisionSvc.recordDecision(eligibilityId, 'APPROVE', 'Evidence pack lineage smoke test', 'admin');
    const finalized = await decisionSvc.finalizeUnlockEligibility(eligibilityId, 'admin');

    const epResult = await evidenceSvc.generateEvidencePack(finalized, 'admin');
    assert.ok(epResult);
    assert.strictEqual(epResult.evidence_schema_version, '166.0');
    console.log('  PASS: Evidence pack generated with schema version 166.0.');

    assert.ok(epResult.lineageHashChain);
    assert.ok(epResult.lineageHashChain.phase166_unlock_eligibility);
    assert.ok(epResult.lineageHashChain.phase165_token_redemption_lock);
    assert.strictEqual(epResult.lineageHashChain.phase165_token_redemption_lock.activation_token_redemption_lock_id, lockId);
    console.log('  PASS: Lineage recursively contains Phase 165 parent lock.');

    if (isProdLike) {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_elig_ev WHERE activation_token_redemption_unlock_eligibility_id = ?`,
        [eligibilityId]
      );
      assert.strictEqual(rows.length, 1);
      console.log('  PASS: Evidence pack record persisted in real DB.');
    }

    console.log('\nSmoke 166E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 166E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
