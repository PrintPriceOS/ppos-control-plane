'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureEvaluatorService').serviceInstance;
const decision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureDecisionService').serviceInstance;

(async () => {
  console.log('=== Smoke 180D: Governance Readiness Closure Decision ===');

  const fneesId = 'fnees_smoke_180d';
  const ksdrId = 'ksdr_smoke_180d';
  const eraId = 'era_smoke_180d';
  const lphId = 'lph_smoke_180d';
  const rocId = 'roc_smoke_180d';
  const cwnId = 'cwn_smoke_180d';
  const fhasId = 'fhas_smoke_180d';
  const dcauId = 'dcau_smoke_180d';
  const oattId = 'oatt_smoke_180d';
  const freezeId = 'freeze_smoke_180d';
  const sealId = 'seal_smoke_180d';
  const frevId = 'frev_smoke_180d';
  const apvId = 'apv_smoke_180d';
  const eligId = 'elig_smoke_180d';
  const lockId = 'lock_smoke_180d';
  const fapvId = 'fapv_smoke_180d';
  const envId = 'env_smoke_180d';
  const authId = 'auth_smoke_180d';
  const readinessId = 'readiness_smoke_180d';
  const issuanceId = 'issuance_smoke_180d';

  try {
    await setupHelper.setupFinalizedUnlockFinalNonExecutionEvidenceSeal(
      fneesId, ksdrId, eraId, lphId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draftResult = await builder.createTokenRedemptionUnlockGovernanceReadinessClosureDraft(fneesId, 'admin');
    const recordId = draftResult.tokenRedemptionUnlockGovernanceReadinessClosure.act_token_redempt_unlock_governance_readiness_closure_id;

    // Invalid role rejected
    await assert.rejects(
      decision.recordGovernanceClosureOfficer(recordId, 'independent_officer', 'invalid_role', 'Rationale', 'admin'),
      /GOVERNANCE_CLOSURE_OFFICER_ROLE_INVALID/
    );
    console.log('  PASS: Correctly rejected invalid evidence seal officer role.');

    await decision.recordGovernanceClosureOfficer(recordId, 'independent_officer', 'compliance_officer', 'Rationale', 'admin');

    // Decision blocked before evaluation
    await assert.rejects(
      decision.recordDecision(recordId, 'APPROVE_GOVERNANCE_READINESS_CLOSURE', 'Rationale', 'admin'),
      /Record must be evaluated before recording decision/
    );
    console.log('  PASS: Correctly blocked decision when not evaluated.');

    // Evaluate
    await evaluator.evaluateUnlockGovernanceReadinessClosure(recordId, {
      governance_readiness_closure_confirmation: true,
      phase160_to_phase179_chain_complete_confirmed: true,
      final_non_execution_evidence_seal_verified: true,
      kill_switch_dry_run_verified: true,
      emergency_rollback_authority_verified: true,
      legal_policy_hold_clearance_verified: true,
      risk_officer_countersign_verified: true,
      compliance_witness_attestation_verified: true,
      final_human_authorization_seal_verified: true,
      dual_control_authorization_verified: true,
      operator_attestation_verified: true,
      pre_execution_freeze_verified: true,
      readiness_seal_verified: true,
      final_review_verified: true,
      token_never_unlocked_confirmed: true,
      token_never_redeemable_confirmed: true,
      token_never_redeemed_confirmed: true,
      zero_runtime_mutation_confirmed: true
    }, 'admin');

    // Invalid decision rejected
    await assert.rejects(
      decision.recordDecision(recordId, 'INVALID_DECISION_TYPE', 'Rationale', 'admin'),
      /INVALID_DECISION/
    );
    console.log('  PASS: Correctly rejected invalid decision type.');

    // Approve
    await decision.recordDecision(recordId, 'APPROVE_GOVERNANCE_READINESS_CLOSURE', 'Approved', 'admin');
    const updated = await builder.getTokenRedemptionUnlockGovernanceReadinessClosure(recordId);
    assert.strictEqual(updated.unlock_governance_readiness_closure_status, 'APPROVED');
    console.log('  PASS: Recorded approve decision successfully.');

    console.log('\nSmoke 180D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 180D:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
