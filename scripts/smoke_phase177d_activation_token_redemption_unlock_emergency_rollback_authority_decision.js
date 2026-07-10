'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityEvaluatorService').serviceInstance;
const decisionService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityDecisionService').serviceInstance;

(async () => {
  console.log('=== Smoke 177D: Activation Token Redemption Unlock Emergency Rollback Authority Decision ===');

  const parentId = 'lph_smoke_177d';
  const rocId = 'roc_smoke_177d';
  const cwnId = 'cwn_smoke_177d';
  const fhasId = 'fhas_smoke_177d';
  const dcauId = 'dcau_smoke_177d';
  const oattId = 'oatt_smoke_177d';
  const freezeId = 'freeze_smoke_177d';
  const sealId = 'seal_smoke_177d';
  const frevId = 'frev_smoke_177d';
  const apvId = 'apv_smoke_177d';
  const eligId = 'elig_smoke_177d';
  const lockId = 'lock_smoke_177d';
  const fapvId = 'fapv_smoke_177d';
  const envId = 'env_smoke_177d';
  const authId = 'auth_smoke_177d';
  const readinessId = 'readiness_smoke_177d';
  const issuanceId = 'issuance_smoke_177d';

  try {
    await setupHelper.setupFinalizedUnlockLegalPolicyHold(
      parentId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draft = await builder.createTokenRedemptionUnlockEmergencyRollbackAuthorityDraft(parentId, 'admin');
    const id = draft.tokenRedemptionUnlockEmergencyRollbackAuthority.act_token_redempt_unlock_emergency_rollback_authority_id;

    // 1. Invalid Rollback Officer role check
    await assert.rejects(
      decisionService.recordRollbackOfficer(id, 'dummy_george', 'invalid_role_of_officer', 'Test reason', 'admin'),
      /ROLLBACK_OFFICER_ROLE_INVALID/
    );
    console.log('  PASS: Correctly rejected invalid rollback officer role.');

    // 2. Assign valid officer
    await decisionService.recordRollbackOfficer(id, 'dummy_george', 'rollback_officer', 'Valid officer assigned', 'admin');

    // 3. Block decision before evaluation
    await assert.rejects(
      decisionService.recordDecision(id, 'APPROVE_EMERGENCY_ROLLBACK_AUTHORITY', 'Approve it', 'admin'),
      /Record must be evaluated before recording decision/
    );
    console.log('  PASS: Correctly blocked decision when not evaluated.');

    // Run evaluator
    const confirmations = {
      emergency_rollback_authority_confirmation: true,
      rollback_officer_assigned_confirmed: true,
      emergency_stop_authority_ready_confirmed: true,
      rollback_channel_available_confirmed: true,
      rollback_runbook_available_confirmed: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      legal_policy_hold_clearance_verified: true,
      risk_officer_countersign_verified: true,
      compliance_witness_attestation_verified: true,
      final_human_seal_authorizer_unlock_seal_verified: true,
      primary_authorizer_unlock_authorization_verified: true,
      secondary_authorizer_unlock_authorization_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    };
    await evaluator.evaluateUnlockEmergencyRollbackAuthority(id, confirmations, 'admin');

    // 4. Reject invalid decision types
    await assert.rejects(
      decisionService.recordDecision(id, 'APPROVE_WITHOUT_ROLLBACK', 'Invalid type', 'admin'),
      /INVALID_DECISION/
    );
    console.log('  PASS: Correctly rejected invalid decision type.');

    // 5. Approve decision
    await decisionService.recordDecision(id, 'APPROVE_EMERGENCY_ROLLBACK_AUTHORITY', 'Approved', 'admin');
    const updated = await builder.getTokenRedemptionUnlockEmergencyRollbackAuthority(id);
    assert.strictEqual(updated.unlock_emergency_rollback_authority_status, 'APPROVED');
    assert.strictEqual(updated.unlock_emergency_rollback_authority_result, 'EMERGENCY_ROLLBACK_AUTHORITY_CONFIRMED_NOT_UNLOCKED');
    console.log('  PASS: Recorded approve decision successfully.');

    console.log('\nSmoke 177D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 177D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
