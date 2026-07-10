'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureEvaluatorService').serviceInstance;
const decision = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureDecisionService').serviceInstance;
const evidencePackService = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureEvidencePackService').serviceInstance;

(async () => {
  console.log('=== Smoke 180E: Governance Readiness Closure Finalize ===');

  const fneesId = 'fnees_smoke_180e';
  const ksdrId = 'ksdr_smoke_180e';
  const eraId = 'era_smoke_180e';
  const lphId = 'lph_smoke_180e';
  const rocId = 'roc_smoke_180e';
  const cwnId = 'cwn_smoke_180e';
  const fhasId = 'fhas_smoke_180e';
  const dcauId = 'dcau_smoke_180e';
  const oattId = 'oatt_smoke_180e';
  const freezeId = 'freeze_smoke_180e';
  const sealId = 'seal_smoke_180e';
  const frevId = 'frev_smoke_180e';
  const apvId = 'apv_smoke_180e';
  const eligId = 'elig_smoke_180e';
  const lockId = 'lock_smoke_180e';
  const fapvId = 'fapv_smoke_180e';
  const envId = 'env_smoke_180e';
  const authId = 'auth_smoke_180e';
  const readinessId = 'readiness_smoke_180e';
  const issuanceId = 'issuance_smoke_180e';

  try {
    await setupHelper.setupFinalizedUnlockFinalNonExecutionEvidenceSeal(
      fneesId, ksdrId, eraId, lphId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draftResult = await builder.createTokenRedemptionUnlockGovernanceReadinessClosureDraft(fneesId, 'admin');
    const recordId = draftResult.tokenRedemptionUnlockGovernanceReadinessClosure.act_token_redempt_unlock_governance_readiness_closure_id;

    await decision.recordGovernanceClosureOfficer(recordId, 'independent_officer', 'compliance_officer', 'Approved setup', 'admin');

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

    await decision.recordDecision(recordId, 'APPROVE_GOVERNANCE_READINESS_CLOSURE', 'Final approved', 'admin');
    await decision.finalizeUnlockGovernanceReadinessClosure(recordId, 'admin');

    const updated = await builder.getTokenRedemptionUnlockGovernanceReadinessClosure(recordId);
    assert.strictEqual(updated.unlock_governance_readiness_closure_status, 'FINALIZED');
    assert.strictEqual(updated.unlock_governance_readiness_closure_result, 'GOVERNANCE_READINESS_CLOSED_NOT_UNLOCKED');
    console.log('  PASS: Finalized governance readiness closure successfully.');

    // Verify evidence pack
    const evidence = await evidencePackService.getEvidence(recordId);
    assert.ok(evidence, 'Evidence record must exist');
    const packJson = typeof evidence.evidence_pack_json === 'string' ? JSON.parse(evidence.evidence_pack_json) : evidence.evidence_pack_json;

    assert.strictEqual(packJson.schema_version, '180.0');
    console.log('  PASS: Evidence schema version is verified as 180.0.');

    // Check lineage chain keys
    const chain = packJson.lineageHashChain;
    const expectedKeys = [
      'phase180_unlock_governance_readiness_closure',
      'phase179_unlock_final_non_execution_evidence_seal',
      'phase178_unlock_kill_switch_dry_run',
      'phase177_unlock_emergency_rollback_authority',
      'phase176_unlock_legal_policy_hold',
      'phase175_unlock_risk_officer_countersign',
      'phase174_unlock_compliance_witness',
      'phase173_unlock_final_human_authorization_seal',
      'phase172_unlock_dual_control_authorization',
      'phase171_unlock_operator_attestation',
      'phase170_unlock_pre_execution_freeze',
      'phase169_unlock_readiness_seal',
      'phase168_unlock_final_review',
      'phase167_unlock_approval',
      'phase166_unlock_eligibility',
      'phase165_redemption_lock',
      'phase164_redemption_final_approval',
      'token_material',
      'redemption_package_freeze'
    ];
    for (const key of expectedKeys) {
      assert.ok(chain[key], `Missing lineage chain key ${key}`);
    }
    console.log('  PASS: Lineage recursively verified from Phase 180 back to Phase 164.');

    // Officer identity redacted (SHA256 representation check)
    assert.ok(!packJson.governance_closure_officer_id);
    assert.ok(packJson.governance_closure_officer_id_sha256);
    console.log('  PASS: Sensitive officer identity successfully redacted.');

    console.log('\nSmoke 180E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 180E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
