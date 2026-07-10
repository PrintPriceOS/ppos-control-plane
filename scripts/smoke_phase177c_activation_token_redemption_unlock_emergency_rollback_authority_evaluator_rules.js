'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityEvaluatorService').serviceInstance;
const decisionService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityDecisionService').serviceInstance;

(async () => {
  console.log('=== Smoke 177C: Activation Token Redemption Unlock Emergency Rollback Authority Evaluator Rules ===');

  const parentId = 'lph_smoke_177c';
  const rocId = 'roc_smoke_177c';
  const cwnId = 'cwn_smoke_177c';
  const fhasId = 'fhas_smoke_177c';
  const dcauId = 'dcau_smoke_177c';
  const oattId = 'oatt_smoke_177c';
  const freezeId = 'freeze_smoke_177c';
  const sealId = 'seal_smoke_177c';
  const frevId = 'frev_smoke_177c';
  const apvId = 'apv_smoke_177c';
  const eligId = 'elig_smoke_177c';
  const lockId = 'lock_smoke_177c';
  const fapvId = 'fapv_smoke_177c';
  const envId = 'env_smoke_177c';
  const authId = 'auth_smoke_177c';
  const readinessId = 'readiness_smoke_177c';
  const issuanceId = 'issuance_smoke_177c';

  try {
    await setupHelper.setupFinalizedUnlockLegalPolicyHold(
      parentId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draft = await builder.createTokenRedemptionUnlockEmergencyRollbackAuthorityDraft(parentId, 'admin');
    const id = draft.tokenRedemptionUnlockEmergencyRollbackAuthority.act_token_redempt_unlock_emergency_rollback_authority_id;

    // 1. Rollback officer missing check
    await assert.rejects(
      evaluator.evaluateUnlockEmergencyRollbackAuthority(id, {}, 'admin'),
      /ROLLBACK_OFFICER_MISSING/
    );

    // Record officer
    await decisionService.recordRollbackOfficer(id, 'dummy_george', 'rollback_officer', 'Valid officer reason', 'admin');

    // 2. Reject when confirmations are missing
    const partialConfirmations = {
      emergency_rollback_authority_confirmation: false, // critical
      rollback_officer_assigned_confirmed: true
    };
    const evalResult = await evaluator.evaluateUnlockEmergencyRollbackAuthority(id, partialConfirmations, 'admin');
    assert.strictEqual(evalResult.allRulesPassed, false);
    console.log('  PASS: Correctly blocked when critical confirmations are missing.');

    // 3. Separation of duties check
    const duplicateDraft = await builder.createTokenRedemptionUnlockEmergencyRollbackAuthorityDraft(parentId, 'admin');
    const duplicateId = duplicateDraft.tokenRedemptionUnlockEmergencyRollbackAuthority.act_token_redempt_unlock_emergency_rollback_authority_id;

    // Let's attempt to assign prior authorizer (primary_authorizer_id = 'dummy_alice' from setup helper)
    await assert.rejects(
      decisionService.recordRollbackOfficer(duplicateId, 'dummy_alice', 'rollback_officer', 'Duplicate actor', 'admin'),
      /ROLLBACK_OFFICER_DUPLICATES_PRIOR_AUTHORIZER_FORBIDDEN/
    );
    console.log('  PASS: Correctly blocked duplicate actor violation.');

    console.log('\nSmoke 177C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 177C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
