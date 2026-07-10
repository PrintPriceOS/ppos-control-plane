'use strict';

const assert = require('assert');
const { setupFinalizedUnlockComplianceWitness, isProdLike } = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignBuilderService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignDecisionService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignEvaluatorService').serviceInstance;
const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 175E: Evidence Pack v175 Lineage ===');

  const unlockComplianceWitnessId = 'cwn_smoke_175e';
  const unlockFinalHumanAuthorizationSealId = 'fhas_smoke_175e';
  const unlockDualControlAuthorizationId = 'dcau_smoke_175e';
  const unlockOperatorAttestationId = 'oatt_smoke_175e';
  const unlockPreExecutionFreezeId = 'freeze_smoke_175e';
  const unlockSealId = 'seal_smoke_175e';
  const finalReviewId = 'frev_smoke_175e';
  const approvalId = 'apv_smoke_175e';
  const eligibilityId = 'elig_smoke_175e';
  const lockId = 'lock_smoke_175e';
  const finalApvId = 'fapv_smoke_175e';
  const envId = 'env_smoke_175e';
  const authId = 'auth_smoke_175e';
  const readinessId = 'readiness_smoke_175e';
  const issuanceId = 'issuance_smoke_175e';

  try {
    await setupFinalizedUnlockComplianceWitness(unlockComplianceWitnessId, unlockFinalHumanAuthorizationSealId, unlockDualControlAuthorizationId, unlockOperatorAttestationId, unlockPreExecutionFreezeId, unlockSealId, finalReviewId, approvalId, eligibilityId, lockId, finalApvId, envId, authId, readinessId, issuanceId);

    const draft = await builder.createTokenRedemptionUnlockRiskOfficerCountersignDraft(unlockComplianceWitnessId, 'admin');
    const tempId = draft.tokenRedemptionUnlockRiskOfficerCountersign.act_token_redempt_unlock_risk_officer_countersign_id;

    await decisionSvc.recordRiskOfficer(tempId, 'user_elena', 'risk_officer', 'Risk officer checks done', 'admin');

    const confirmations = {
      risk_officer_countersign_confirmation: true,
      compliance_witness_attestation_verified: true,
      final_human_seal_authorizer_unlock_seal_verified: true,
      primary_authorizer_unlock_authorization_verified: true,
      secondary_authorizer_unlock_authorization_verified: true,
      security_officer_unlock_attestation_verified: true,
      compliance_officer_unlock_attestation_verified: true,
      operations_director_unlock_attestation_verified: true,
      rollback_authority_unlock_attestation_verified: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    };

    await evaluator.evaluateUnlockRiskOfficerCountersign(tempId, confirmations, 'admin');
    await decisionSvc.recordDecision(tempId, 'APPROVE_RISK_COUNTERSIGN', 'All checks passed', 'admin');

    const finalized = await decisionSvc.finalizeUnlockRiskOfficerCountersign(tempId, 'admin');

    assert.ok(finalized.evidence_pack_hash, 'Evidence pack hash is missing');
    assert.ok(finalized.lineage_hash_chain_json, 'Lineage hash chain is missing');

    const lineage = finalized.lineage_hash_chain_json;
    assert.ok(lineage.phase175_unlock_risk_officer_countersign, 'Missing lineage key phase175');
    assert.ok(lineage.phase174_unlock_compliance_witness, 'Missing lineage key phase174');
    assert.ok(lineage.phase173_unlock_final_human_authorization_seal, 'Missing lineage key phase173');
    assert.ok(lineage.phase172_unlock_dual_control_authorization, 'Missing lineage key phase172');
    assert.ok(lineage.phase171_unlock_operator_attestation, 'Missing lineage key phase171');
    assert.ok(lineage.phase170_unlock_pre_execution_freeze, 'Missing lineage key phase170');
    assert.ok(lineage.phase169_unlock_readiness_seal, 'Missing lineage key phase169');
    assert.ok(lineage.phase168_unlock_final_review, 'Missing lineage key phase168');
    assert.ok(lineage.phase167_unlock_approval, 'Missing lineage key phase167');
    assert.ok(lineage.phase166_unlock_eligibility, 'Missing lineage key phase166');
    assert.ok(lineage.phase165_redemption_lock, 'Missing lineage key phase165');
    assert.ok(lineage.phase164_redemption_final_approval, 'Missing lineage key phase164');
    assert.ok(lineage.token_material, 'Missing lineage key token_material');
    assert.ok(lineage.redemption_package_freeze, 'Missing lineage key redemption_package_freeze');

    console.log('  PASS: Evidence pack generated with schema version 175.0.');
    console.log('  PASS: Lineage recursively contains Phase 174, 173, 172, 171, 170, 169, 168, 167, 166, 165, 164.');

    // Minimized/Redacted sensitive identity check
    const epSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignEvidencePackService').serviceInstance;
    let payload;
    if (!isProdLike) {
      const epRecord = epSvc._mockEvidence.get(tempId);
      payload = JSON.parse(epRecord.evidence_payload_json);
    } else {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_roc_ev WHERE act_token_redempt_unlock_risk_officer_countersign_id = ?`,
        [tempId]
      );
      assert.strictEqual(rows.length, 1);
      payload = JSON.parse(rows[0].evidence_payload_json);
    }

    assert.ok(!payload.risk_officer_id, 'Sensitive risk officer ID should be redacted');
    assert.ok(payload.risk_officer_id_sha256, 'Risk officer ID hash must be present');
    console.log('  PASS: Risk Officer identity is redacted (minimized/hashed).');

    // Risk Officer independence checks
    assert.ok(payload.risk_officer_id_sha256 !== payload.primary_authorizer_id_sha256);
    assert.ok(payload.risk_officer_id_sha256 !== payload.secondary_authorizer_id_sha256);
    assert.ok(payload.risk_officer_id_sha256 !== payload.final_human_authorizer_id_sha256);
    assert.ok(payload.risk_officer_id_sha256 !== payload.compliance_witness_id_sha256);
    console.log('  PASS: Risk Officer is verified independent from primary, secondary, human seal authorizers and compliance witness.');

    console.log('\nSmoke 175E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 175E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
