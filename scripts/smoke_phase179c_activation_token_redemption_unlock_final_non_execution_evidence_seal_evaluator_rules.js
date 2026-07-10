'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealEvaluatorService').serviceInstance;
const decisionService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealDecisionService').serviceInstance;

(async () => {
  console.log('=== Smoke 179C: Final Non-Execution Evidence Seal Evaluator Rules ===');

  const ksdrId = 'ksdr_smoke_179c';
  const eraId = 'era_smoke_179c';
  const lphId = 'lph_smoke_179c';
  const rocId = 'roc_smoke_179c';
  const cwnId = 'cwn_smoke_179c';
  const fhasId = 'fhas_smoke_179c';
  const dcauId = 'dcau_smoke_179c';
  const oattId = 'oatt_smoke_179c';
  const freezeId = 'freeze_smoke_179c';
  const sealId = 'seal_smoke_179c';
  const frevId = 'frev_smoke_179c';
  const apvId = 'apv_smoke_179c';
  const eligId = 'elig_smoke_179c';
  const lockId = 'lock_smoke_179c';
  const fapvId = 'fapv_smoke_179c';
  const envId = 'env_smoke_179c';
  const authId = 'auth_smoke_179c';
  const readinessId = 'readiness_smoke_179c';
  const issuanceId = 'issuance_smoke_179c';

  try {
    await setupHelper.setupFinalizedUnlockKillSwitchDryRun(
      ksdrId, eraId, lphId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draft = await builder.createTokenRedemptionUnlockFinalNonExecutionEvidenceSealDraft(ksdrId, 'admin');
    const id = draft.tokenRedemptionUnlockFinalNonExecutionEvidenceSeal.act_token_redempt_unlock_final_non_execution_evidence_seal_id;

    // 1. Officer missing check
    await assert.rejects(
      evaluator.evaluateUnlockFinalNonExecutionEvidenceSeal(id, {}, 'admin'),
      /EVIDENCE_SEAL_OFFICER_MISSING/
    );
    console.log('  PASS: Correctly blocked evaluation when evidence seal officer is missing.');

    // Record officer
    await decisionService.recordEvidenceSealOfficer(id, 'dummy_karl', 'compliance_officer', 'Valid officer reason', 'admin');

    // 2. Reject when critical confirmations are missing
    const partialConfirmations = {
      final_non_execution_evidence_seal_confirmation: true,
      token_never_unlocked_confirmed: false // critical - will fail
    };
    const evalResult = await evaluator.evaluateUnlockFinalNonExecutionEvidenceSeal(id, partialConfirmations, 'admin');
    assert.strictEqual(evalResult.allRulesPassed, false);
    console.log('  PASS: Correctly blocked when critical confirmations are missing.');

    // 3. Separation of duties check: dummy_alice is primary_authorizer from setup
    const duplicateDraft = await builder.createTokenRedemptionUnlockFinalNonExecutionEvidenceSealDraft(ksdrId, 'admin');
    const duplicateId = duplicateDraft.tokenRedemptionUnlockFinalNonExecutionEvidenceSeal.act_token_redempt_unlock_final_non_execution_evidence_seal_id;

    await assert.rejects(
      decisionService.recordEvidenceSealOfficer(duplicateId, 'dummy_alice', 'compliance_officer', 'Duplicate actor', 'admin'),
      /EVIDENCE_SEAL_OFFICER_DUPLICATES_PRIOR_AUTHORIZER_FORBIDDEN/
    );
    console.log('  PASS: Correctly blocked duplicate actor violation.');

    console.log('\nSmoke 179C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 179C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
