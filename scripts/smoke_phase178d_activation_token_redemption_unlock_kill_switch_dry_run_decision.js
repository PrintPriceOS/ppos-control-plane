'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunEvaluatorService').serviceInstance;
const decisionService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunDecisionService').serviceInstance;

(async () => {
  console.log('=== Smoke 178D: Kill-Switch Dry-Run Decision ===');

  const eraId = 'era_smoke_178d';
  const lphId = 'lph_smoke_178d';
  const rocId = 'roc_smoke_178d';
  const cwnId = 'cwn_smoke_178d';
  const fhasId = 'fhas_smoke_178d';
  const dcauId = 'dcau_smoke_178d';
  const oattId = 'oatt_smoke_178d';
  const freezeId = 'freeze_smoke_178d';
  const sealId = 'seal_smoke_178d';
  const frevId = 'frev_smoke_178d';
  const apvId = 'apv_smoke_178d';
  const eligId = 'elig_smoke_178d';
  const lockId = 'lock_smoke_178d';
  const fapvId = 'fapv_smoke_178d';
  const envId = 'env_smoke_178d';
  const authId = 'auth_smoke_178d';
  const readinessId = 'readiness_smoke_178d';
  const issuanceId = 'issuance_smoke_178d';

  try {
    await setupHelper.setupFinalizedUnlockEmergencyRollbackAuthority(
      eraId, lphId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draft = await builder.createTokenRedemptionUnlockKillSwitchDryRunDraft(eraId, 'admin');
    const id = draft.tokenRedemptionUnlockKillSwitchDryRun.act_token_redempt_unlock_kill_switch_dry_run_id;

    // 1. Invalid officer role check
    await assert.rejects(
      decisionService.recordVerificationOfficer(id, 'dummy_henry', 'invalid_role_for_kill_switch', 'Test reason', 'admin'),
      /KILL_SWITCH_VERIFICATION_OFFICER_ROLE_INVALID/
    );
    console.log('  PASS: Correctly rejected invalid verification officer role.');

    // 2. Assign valid officer
    await decisionService.recordVerificationOfficer(id, 'dummy_henry', 'security_officer', 'Valid officer assigned', 'admin');

    // 3. Block decision before evaluation
    await assert.rejects(
      decisionService.recordDecision(id, 'APPROVE_KILL_SWITCH_DRY_RUN', 'Approve it', 'admin'),
      /Record must be evaluated before recording decision/
    );
    console.log('  PASS: Correctly blocked decision when not evaluated.');

    // Run evaluator with all 16 confirmations passing
    const confirmations = {
      kill_switch_dry_run_verification_confirmation: true,
      kill_switch_route_available_confirmed: true,
      kill_switch_dry_run_response_confirmed: true,
      kill_switch_no_runtime_mutation_confirmed: true,
      kill_switch_no_real_execution_confirmed: true,
      rollback_officer_ready_confirmed: true,
      emergency_stop_authority_ready_confirmed: true,
      rollback_channel_available_confirmed: true,
      rollback_runbook_available_confirmed: true,
      non_execution_confirmed: true,
      legal_policy_hold_clearance_verified: true,
      risk_officer_countersign_verified: true,
      compliance_witness_attestation_verified: true,
      final_human_authorization_seal_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    };
    await evaluator.evaluateUnlockKillSwitchDryRun(id, confirmations, 'admin');

    // 4. Reject invalid decision types
    await assert.rejects(
      decisionService.recordDecision(id, 'APPROVE_WITHOUT_DRY_RUN', 'Invalid type', 'admin'),
      /INVALID_DECISION/
    );
    console.log('  PASS: Correctly rejected invalid decision type.');

    // 5. Approve decision
    await decisionService.recordDecision(id, 'APPROVE_KILL_SWITCH_DRY_RUN', 'Approved', 'admin');
    const updated = await builder.getTokenRedemptionUnlockKillSwitchDryRun(id);
    assert.strictEqual(updated.unlock_kill_switch_dry_run_status, 'APPROVED');
    assert.strictEqual(updated.unlock_kill_switch_dry_run_result, 'KILL_SWITCH_DRY_RUN_VERIFIED_NOT_UNLOCKED');
    console.log('  PASS: Recorded approve decision successfully.');

    console.log('\nSmoke 178D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 178D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
