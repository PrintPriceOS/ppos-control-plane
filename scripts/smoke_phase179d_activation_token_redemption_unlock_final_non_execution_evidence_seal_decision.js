'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealEvaluatorService').serviceInstance;
const decisionService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealDecisionService').serviceInstance;

(async () => {
  console.log('=== Smoke 179D: Final Non-Execution Evidence Seal Decision ===');

  const ksdrId = 'ksdr_smoke_179d';
  const eraId = 'era_smoke_179d';
  const lphId = 'lph_smoke_179d';
  const rocId = 'roc_smoke_179d';
  const cwnId = 'cwn_smoke_179d';
  const fhasId = 'fhas_smoke_179d';
  const dcauId = 'dcau_smoke_179d';
  const oattId = 'oatt_smoke_179d';
  const freezeId = 'freeze_smoke_179d';
  const sealId = 'seal_smoke_179d';
  const frevId = 'frev_smoke_179d';
  const apvId = 'apv_smoke_179d';
  const eligId = 'elig_smoke_179d';
  const lockId = 'lock_smoke_179d';
  const fapvId = 'fapv_smoke_179d';
  const envId = 'env_smoke_179d';
  const authId = 'auth_smoke_179d';
  const readinessId = 'readiness_smoke_179d';
  const issuanceId = 'issuance_smoke_179d';

  try {
    await setupHelper.setupFinalizedUnlockKillSwitchDryRun(
      ksdrId, eraId, lphId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draft = await builder.createTokenRedemptionUnlockFinalNonExecutionEvidenceSealDraft(ksdrId, 'admin');
    const id = draft.tokenRedemptionUnlockFinalNonExecutionEvidenceSeal.act_token_redempt_unlock_final_non_execution_evidence_seal_id;

    // 1. Invalid officer role check
    await assert.rejects(
      decisionService.recordEvidenceSealOfficer(id, 'dummy_karl', 'invalid_role_for_seal', 'Test reason', 'admin'),
      /EVIDENCE_SEAL_OFFICER_ROLE_INVALID/
    );
    console.log('  PASS: Correctly rejected invalid evidence seal officer role.');

    // 2. Assign valid officer
    await decisionService.recordEvidenceSealOfficer(id, 'dummy_karl', 'compliance_officer', 'Valid officer assigned', 'admin');

    // 3. Block decision before evaluation
    await assert.rejects(
      decisionService.recordDecision(id, 'APPROVE_FINAL_NON_EXECUTION_EVIDENCE_SEAL', 'Approve it', 'admin'),
      /Record must be evaluated before recording decision/
    );
    console.log('  PASS: Correctly blocked decision when not evaluated.');

    // Run evaluator with all 17 confirmations passing
    const confirmations = {
      final_non_execution_evidence_seal_confirmation: true,
      token_never_unlocked_confirmed: true,
      token_never_redeemable_confirmed: true,
      token_never_redeemed_confirmed: true,
      high_risk_execution_never_enabled_confirmed: true,
      plan_never_executable_confirmed: true,
      no_real_job_created_confirmed: true,
      no_queue_dispatch_confirmed: true,
      zero_runtime_mutation_confirmed: true,
      kill_switch_dry_run_verified: true,
      emergency_rollback_authority_verified: true,
      legal_policy_hold_clearance_verified: true,
      risk_officer_countersign_verified: true,
      compliance_witness_attestation_verified: true,
      final_human_authorization_seal_verified: true,
      dual_control_authorization_verified: true,
      lineage_integrity_verified: true
    };
    await evaluator.evaluateUnlockFinalNonExecutionEvidenceSeal(id, confirmations, 'admin');

    // 4. Reject invalid decision types
    await assert.rejects(
      decisionService.recordDecision(id, 'APPROVE_WITHOUT_SEAL', 'Invalid type', 'admin'),
      /INVALID_DECISION/
    );
    console.log('  PASS: Correctly rejected invalid decision type.');

    // 5. Approve decision
    await decisionService.recordDecision(id, 'APPROVE_FINAL_NON_EXECUTION_EVIDENCE_SEAL', 'Approved', 'admin');
    const updated = await builder.getTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(id);
    assert.strictEqual(updated.unlock_final_non_execution_evidence_seal_status, 'APPROVED');
    assert.strictEqual(updated.unlock_final_non_execution_evidence_seal_result, 'FINAL_NON_EXECUTION_EVIDENCE_SEALED_NOT_UNLOCKED');
    console.log('  PASS: Recorded approve decision successfully.');

    console.log('\nSmoke 179D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 179D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
