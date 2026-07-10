'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunEvaluatorService').serviceInstance;
const decisionService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunDecisionService').serviceInstance;

(async () => {
  console.log('=== Smoke 178C: Kill-Switch Dry-Run Evaluator Rules ===');

  const eraId = 'era_smoke_178c';
  const lphId = 'lph_smoke_178c';
  const rocId = 'roc_smoke_178c';
  const cwnId = 'cwn_smoke_178c';
  const fhasId = 'fhas_smoke_178c';
  const dcauId = 'dcau_smoke_178c';
  const oattId = 'oatt_smoke_178c';
  const freezeId = 'freeze_smoke_178c';
  const sealId = 'seal_smoke_178c';
  const frevId = 'frev_smoke_178c';
  const apvId = 'apv_smoke_178c';
  const eligId = 'elig_smoke_178c';
  const lockId = 'lock_smoke_178c';
  const fapvId = 'fapv_smoke_178c';
  const envId = 'env_smoke_178c';
  const authId = 'auth_smoke_178c';
  const readinessId = 'readiness_smoke_178c';
  const issuanceId = 'issuance_smoke_178c';

  try {
    await setupHelper.setupFinalizedUnlockEmergencyRollbackAuthority(
      eraId, lphId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draft = await builder.createTokenRedemptionUnlockKillSwitchDryRunDraft(eraId, 'admin');
    const id = draft.tokenRedemptionUnlockKillSwitchDryRun.act_token_redempt_unlock_kill_switch_dry_run_id;

    // 1. Officer missing check
    await assert.rejects(
      evaluator.evaluateUnlockKillSwitchDryRun(id, {}, 'admin'),
      /KILL_SWITCH_VERIFICATION_OFFICER_MISSING/
    );
    console.log('  PASS: Correctly blocked evaluation when verification officer is missing.');

    // Record officer
    await decisionService.recordVerificationOfficer(id, 'dummy_henry', 'security_officer', 'Valid officer reason', 'admin');

    // 2. Reject when critical confirmations are missing
    const partialConfirmations = {
      kill_switch_dry_run_verification_confirmation: false, // critical — will fail
      kill_switch_route_available_confirmed: true
    };
    const evalResult = await evaluator.evaluateUnlockKillSwitchDryRun(id, partialConfirmations, 'admin');
    assert.strictEqual(evalResult.allRulesPassed, false);
    console.log('  PASS: Correctly blocked when critical confirmations are missing.');

    // 3. Separation of duties check: dummy_alice is primary_authorizer from setup
    const duplicateDraft = await builder.createTokenRedemptionUnlockKillSwitchDryRunDraft(eraId, 'admin');
    const duplicateId = duplicateDraft.tokenRedemptionUnlockKillSwitchDryRun.act_token_redempt_unlock_kill_switch_dry_run_id;

    await assert.rejects(
      decisionService.recordVerificationOfficer(duplicateId, 'dummy_alice', 'security_officer', 'Duplicate actor', 'admin'),
      /KILL_SWITCH_VERIFIER_DUPLICATES_PRIOR_AUTHORIZER_FORBIDDEN/
    );
    console.log('  PASS: Correctly blocked duplicate actor violation.');

    console.log('\nSmoke 178C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 178C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
