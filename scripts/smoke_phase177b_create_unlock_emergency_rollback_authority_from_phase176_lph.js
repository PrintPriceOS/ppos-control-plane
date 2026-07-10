'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityBuilderService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

(async () => {
  console.log('=== Smoke 177B: Create Unlock Emergency Rollback Authority Draft ===');

  const parentId = 'lph_smoke_177b';
  const rocId = 'roc_smoke_177b';
  const cwnId = 'cwn_smoke_177b';
  const fhasId = 'fhas_smoke_177b';
  const dcauId = 'dcau_smoke_177b';
  const oattId = 'oatt_smoke_177b';
  const freezeId = 'freeze_smoke_177b';
  const sealId = 'seal_smoke_177b';
  const frevId = 'frev_smoke_177b';
  const apvId = 'apv_smoke_177b';
  const eligId = 'elig_smoke_177b';
  const lockId = 'lock_smoke_177b';
  const fapvId = 'fapv_smoke_177b';
  const envId = 'env_smoke_177b';
  const authId = 'auth_smoke_177b';
  const readinessId = 'readiness_smoke_177b';
  const issuanceId = 'issuance_smoke_177b';

  try {
    await setupHelper.setupFinalizedUnlockLegalPolicyHold(
      parentId, rocId, cwnId, fhasId, dcauId, oattId, freezeId, sealId, frevId, apvId, eligId, lockId, fapvId, envId, authId, readinessId, issuanceId
    );

    const draft = await builder.createTokenRedemptionUnlockEmergencyRollbackAuthorityDraft(parentId, 'admin');
    const record = draft.tokenRedemptionUnlockEmergencyRollbackAuthority;

    assert.strictEqual(record.source_act_token_redempt_unlock_legal_policy_hold_id, parentId);
    assert.strictEqual(record.unlock_emergency_rollback_authority_status, 'DRAFT');
    assert.strictEqual(record.token_unlock_status, 'NOT_UNLOCKED');
    console.log('  PASS: Draft unlock emergency rollback authority created successfully from Phase 176 legal policy hold.');

    // Negative case: Parent not finalized
    const badParentId = 'lph_unfinalized_smoke_177b';
    if (!isProdLike) {
      const parentBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldBuilderService').serviceInstance;
      parentBuilder._mockState.tokenRedemptionUnlockLegalPolicyHold.set(badParentId, {
        act_token_redempt_unlock_legal_policy_hold_id: badParentId,
        unlock_legal_policy_hold_status: 'DRAFT',
        unlock_legal_policy_hold_result: 'LEGAL_POLICY_HOLD_FAILED',
        token_unlock_status: 'NOT_UNLOCKED',
        token_redeemable_status: 'NOT_REDEEMABLE',
        token_redemption_status: 'LOCKED_NOT_REDEEMED',
        execution_capability_status: 'EXECUTION_NOT_ENABLED',
        plan_executable_status: 'NOT_EXECUTABLE',
        job_creation_status: 'NO_REAL_JOB_CREATED',
        queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
        runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED'
      });
    } else {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_lph WHERE act_token_redempt_unlock_legal_policy_hold_id = ?`, [badParentId]);
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_lph
         (act_token_redempt_unlock_legal_policy_hold_id, source_act_token_redempt_unlock_risk_officer_countersign_id, source_act_token_redempt_unlock_compliance_witness_id, source_act_token_redempt_unlock_final_human_auth_seal_id, source_act_token_redempt_unlock_dual_control_authorization_id, source_act_token_redempt_unlock_operator_attestation_id, source_act_token_redempt_unlock_pre_execution_freeze_id, source_activation_token_redemption_unlock_seal_id, source_activation_token_redemption_unlock_final_review_id, source_activation_token_redemption_unlock_approval_id, source_activation_token_redemption_unlock_eligibility_id, source_activation_token_redemption_lock_id, source_activation_token_redemption_final_apv_id, source_activation_token_redemption_envelope_id, source_activation_token_redemption_auth_id, source_activation_token_redemption_readiness_id, source_activation_token_issuance_id, source_activation_token_staging_id, source_activation_token_preflight_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, cohort_id, tenant_id, simulation_type, unlock_legal_policy_hold_status, unlock_legal_policy_hold_result, unlock_legal_policy_hold_mode, unlock_risk_officer_countersign_status, unlock_compliance_witness_status, unlock_final_human_authorization_seal_status, unlock_dual_control_authorization_status, unlock_operator_attestation_status, unlock_pre_execution_freeze_status, unlock_seal_status, unlock_final_review_status, unlock_approval_status, unlock_eligibility_status, token_redemption_lock_status, token_redemption_status, token_unlock_status, token_redeemable_status, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status, write_scope_status, canary_envelope_json, unlock_legal_policy_hold_summary_json, impact_review_json, rollback_review_json, guardrail_review_json, unlock_legal_policy_hold_rules_json, unlock_legal_policy_hold_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_unlock_risk_officer_countersign_hash, source_unlock_compliance_witness_hash, source_unlock_final_human_authorization_seal_hash, source_unlock_dual_control_authorization_hash, source_unlock_operator_attestation_hash, source_unlock_pre_execution_freeze_hash, source_unlock_seal_hash, source_unlock_final_review_hash, source_unlock_approval_hash, source_unlock_eligibility_hash, source_redemption_lock_hash, source_redemption_final_approval_hash, source_redemption_package_freeze_hash, source_token_material_hash, unlock_legal_policy_hold_hash, unlock_legal_policy_hold_evidence_pack_hash, evidence_pack_hash, lineage_hash_chain_json, security_signature_json, attestation_rationale_json, execution_capability_status, activation_execution_status, package_freeze_status, redemption_package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, primary_authorizer_id, secondary_authorizer_id, final_human_authorizer_id, compliance_witness_id, risk_officer_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [badParentId, 'roc', 'cwn', 'fhas', 'dcau', 'oatt', 'freeze', 'seal', 'frev', 'apv', 'elig', 'lock', 'fapv', 'env', 'auth', 'readiness', 'issuance', 'stg', 'pfl', 'pln', 'dsp', 'env', 'auth', 'rd', 'apv', 'prep', 'cohort_dummy', 'tenant_dummy', 'sim_dummy', 'DRAFT', 'LEGAL_POLICY_HOLD_FAILED', 'LEGAL_POLICY_HOLD_CONFIRMATION_ONLY', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'FINALIZED', 'UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED', 'LOCKED_NOT_REDEEMED', 'LOCKED_NOT_REDEEMED', 'NOT_UNLOCKED', 'NOT_REDEEMABLE', 'LOW', 'HIGH', 0.1, 0.9, 1.0, 'PASSED', 'PASSED', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11', 'h12', 'h13', 'h14', 'h15', '{}', '{}', '{}', 'EXECUTION_NOT_ENABLED', 'UNLOCK_LEGAL_POLICY_HOLD_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'dummy_alice', 'dummy_bob', 'dummy_charlie', 'dummy_diana', 'dummy_elena', 'admin', 'admin']
      );
    }

    await assert.rejects(
      builder.createTokenRedemptionUnlockEmergencyRollbackAuthorityDraft(badParentId, 'admin'),
      /Parent legal policy hold must be FINALIZED/
    );
    console.log('  PASS: Correctly blocked draft from non-finalized parent.');

    console.log('\nSmoke 177B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 177B:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
