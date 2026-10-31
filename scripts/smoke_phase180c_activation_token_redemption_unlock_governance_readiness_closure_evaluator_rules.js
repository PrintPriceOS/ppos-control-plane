'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureEvaluatorService').serviceInstance;
const decision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureDecisionService').serviceInstance;

(async () => {
  console.log('=== Smoke 180C: Governance Readiness Closure Evaluator Rules ===');

  const fneesId = 'fnees_smoke_180c';
  const ksdrId = 'ksdr_smoke_180c';
  const eraId = 'era_smoke_180c';
  const lphId = 'lph_smoke_180c';
  const rocId = 'roc_smoke_180c';
  const cwnId = 'cwn_smoke_180c';
  const fhasId = 'fhas_smoke_180c';
  const dcauId = 'dcau_smoke_180c';
  const oattId = 'oatt_smoke_180c';
  const freezeId = 'freeze_smoke_180c';
  const sealId = 'seal_smoke_180c';
  const frevId = 'frev_smoke_180c';
  const apvId = 'apv_smoke_180c';
  const eligId = 'elig_smoke_180c';
  const lockId = 'lock_smoke_180c';
  const fapvId = 'fapv_smoke_180c';
  const envId = 'env_smoke_180c';
  const authId = 'auth_smoke_180c';
  const readinessId = 'readiness_smoke_180c';
  const issuanceId = 'issuance_smoke_180c';

  try {
    await setupHelper.setupFinalizedUnlockFinalNonExecutionEvidenceSeal(
      fneesId, ksdrId, eraId, lphId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draftResult = await builder.createTokenRedemptionUnlockGovernanceReadinessClosureDraft(fneesId, 'admin');
    const record = draftResult.tokenRedemptionUnlockGovernanceReadinessClosure;
    const recordId = record.act_token_redempt_unlock_governance_readiness_closure_id;

    // Blocked if officer is missing
    await assert.rejects(
      evaluator.evaluateUnlockGovernanceReadinessClosure(recordId, {}, 'admin'),
      /GOVERNANCE_CLOSURE_OFFICER_MISSING/
    );
    console.log('  PASS: Correctly blocked evaluation when evidence seal officer is missing.');

    // Record officer and evaluate
    await decision.recordGovernanceClosureOfficer(recordId, 'independent_officer', 'compliance_officer', 'No overlap', 'admin');

    const result = await evaluator.evaluateUnlockGovernanceReadinessClosure(recordId, {
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

    assert.strictEqual(result.allRulesPassed, true);
    console.log('  PASS: Evaluated successfully with all confirmations.');

    // Duplicate actor validation
    const draftResult2 = await builder.createTokenRedemptionUnlockGovernanceReadinessClosureDraft(fneesId, 'admin');
    const recordId2 = draftResult2.tokenRedemptionUnlockGovernanceReadinessClosure.act_token_redempt_unlock_governance_readiness_closure_id;

    // Officer matches primary authorizer (which is 'dummy_alice' from the setup)
    await assert.rejects(
      decision.recordGovernanceClosureOfficer(recordId2, 'dummy_alice', 'compliance_officer', 'Overlap', 'admin'),
      /GOVERNANCE_CLOSURE_OFFICER_DUPLICATES_PRIOR_AUTHORIZER_FORBIDDEN/
    );
    console.log('  PASS: Correctly blocked duplicate actor violation.');

    console.log('\nSmoke 180C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 180C:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
