'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const parentBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityAuditService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

function parseJsonField(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'object') {
    return value;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_error) {
      return fallback;
    }
  }
  return fallback;
}

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityBuilderService {
  constructor() {
    this._mockState = {
      tokenRedemptionUnlockEmergencyRollbackAuthority: new Map(),
      rules: new Map()
    };
  }

  async createTokenRedemptionUnlockEmergencyRollbackAuthorityDraft(unlockLegalPolicyHoldId, actorId) {
    const parent = await parentBuilder.getTokenRedemptionUnlockLegalPolicyHold(unlockLegalPolicyHoldId);
    if (!parent) {
      throw new Error(`Parent legal policy hold record ${unlockLegalPolicyHoldId} not found.`);
    }

    if (parent.unlock_legal_policy_hold_status !== 'FINALIZED') {
      throw new Error(`Parent legal policy hold must be FINALIZED. Current status: ${parent.unlock_legal_policy_hold_status}`);
    }

    if (parent.unlock_legal_policy_hold_result !== 'LEGAL_POLICY_HOLD_CLEARED_NOT_UNLOCKED') {
      throw new Error(`Parent legal policy hold result must be LEGAL_POLICY_HOLD_CLEARED_NOT_UNLOCKED. Current result: ${parent.unlock_legal_policy_hold_result}`);
    }

    // Safety Boundary Validations
    if (parent.token_unlock_status !== 'NOT_UNLOCKED' ||
        parent.token_redeemable_status !== 'NOT_REDEEMABLE' ||
        parent.token_redemption_status !== 'LOCKED_NOT_REDEEMED' ||
        parent.execution_capability_status !== 'EXECUTION_NOT_ENABLED' ||
        parent.plan_executable_status !== 'NOT_EXECUTABLE' ||
        parent.job_creation_status !== 'NO_REAL_JOB_CREATED' ||
        parent.queue_dispatch_status !== 'NO_QUEUE_DISPATCHED' ||
        parent.runtime_mutation_status !== 'ZERO_RUNTIME_MUTATION_CONFIRMED') {
      throw new Error('Safety boundary check failed: Parent properties are modified or altered.');
    }

    const unlockEmergencyRollbackAuthorityId = 'era_' + crypto.randomBytes(8).toString('hex');

    const draft = {
      act_token_redempt_unlock_emergency_rollback_authority_id: unlockEmergencyRollbackAuthorityId,
      source_act_token_redempt_unlock_legal_policy_hold_id: unlockLegalPolicyHoldId,
      source_act_token_redempt_unlock_risk_officer_countersign_id: parent.source_act_token_redempt_unlock_risk_officer_countersign_id,
      source_act_token_redempt_unlock_compliance_witness_id: parent.source_act_token_redempt_unlock_compliance_witness_id,
      source_act_token_redempt_unlock_final_human_auth_seal_id: parent.source_act_token_redempt_unlock_final_human_auth_seal_id,
      source_act_token_redempt_unlock_dual_control_authorization_id: parent.source_act_token_redempt_unlock_dual_control_authorization_id,
      source_act_token_redempt_unlock_operator_attestation_id: parent.source_act_token_redempt_unlock_operator_attestation_id,
      source_act_token_redempt_unlock_pre_execution_freeze_id: parent.source_act_token_redempt_unlock_pre_execution_freeze_id,
      source_activation_token_redemption_unlock_seal_id: parent.source_activation_token_redemption_unlock_seal_id,
      source_activation_token_redemption_unlock_final_review_id: parent.source_activation_token_redemption_unlock_final_review_id,
      source_activation_token_redemption_unlock_approval_id: parent.source_activation_token_redemption_unlock_approval_id,
      source_activation_token_redemption_unlock_eligibility_id: parent.source_activation_token_redemption_unlock_eligibility_id,
      source_activation_token_redemption_lock_id: parent.source_activation_token_redemption_lock_id,
      source_activation_token_redemption_final_apv_id: parent.source_activation_token_redemption_final_apv_id,
      source_activation_token_redemption_envelope_id: parent.source_activation_token_redemption_envelope_id,
      source_activation_token_redemption_auth_id: parent.source_activation_token_redemption_auth_id,
      source_activation_token_redemption_readiness_id: parent.source_activation_token_redemption_readiness_id,
      source_activation_token_issuance_id: parent.source_activation_token_issuance_id,
      source_activation_token_staging_id: parent.source_activation_token_staging_id,
      source_activation_token_preflight_id: parent.source_activation_token_preflight_id,
      source_plan_id: parent.source_plan_id,
      source_dispatcher_id: parent.source_dispatcher_id,
      source_envelope_id: parent.source_envelope_id,
      source_auth_id: parent.source_auth_id,
      source_readiness_id: parent.source_readiness_id,
      source_approval_id: parent.source_approval_id,
      source_prep_id: parent.source_prep_id,
      cohort_id: parent.cohort_id,
      tenant_id: parent.tenant_id,
      simulation_type: parent.simulation_type,
      unlock_emergency_rollback_authority_status: 'DRAFT',
      unlock_emergency_rollback_authority_result: 'EMERGENCY_ROLLBACK_AUTHORITY_BLOCKED_BY_LEGAL_POLICY_HOLD',
      unlock_emergency_rollback_authority_mode: 'EMERGENCY_ROLLBACK_AUTHORITY_CONFIRMATION_ONLY',
      unlock_legal_policy_hold_status: parent.unlock_legal_policy_hold_status,
      unlock_risk_officer_countersign_status: parent.unlock_risk_officer_countersign_status,
      unlock_compliance_witness_status: parent.unlock_compliance_witness_status,
      unlock_final_human_authorization_seal_status: parent.unlock_final_human_authorization_seal_status,
      unlock_dual_control_authorization_status: parent.unlock_dual_control_authorization_status,
      unlock_operator_attestation_status: parent.unlock_operator_attestation_status,
      unlock_pre_execution_freeze_status: parent.unlock_pre_execution_freeze_status,
      unlock_seal_status: parent.unlock_seal_status,
      unlock_final_review_status: parent.unlock_final_review_status,
      unlock_approval_status: parent.unlock_approval_status,
      unlock_eligibility_status: parent.unlock_eligibility_status,
      token_redemption_lock_status: parent.token_redemption_lock_status,
      token_redemption_status: parent.token_redemption_status,
      token_unlock_status: parent.token_unlock_status,
      token_redeemable_status: parent.token_redeemable_status,
      risk_level: parent.risk_level,
      confidence_level: parent.confidence_level,
      projected_impact_score: parent.projected_impact_score,
      rollback_feasibility_score: parent.rollback_feasibility_score,
      evidence_completeness_score: parent.evidence_completeness_score,
      guardrail_status: parent.guardrail_status,
      write_scope_status: parent.write_scope_status,
      canary_envelope_json: parent.canary_envelope_json || '{}',
      unlock_emergency_rollback_authority_summary_json: '{}',
      impact_review_json: '{}',
      rollback_review_json: '{}',
      guardrail_review_json: '{}',
      unlock_emergency_rollback_authority_rules_json: '{}',
      unlock_emergency_rollback_authority_blockers_json: '{}',
      non_execution_attestation_json: JSON.stringify(parent.non_execution_attestation_json || {}),
      write_scope_attestation_json: JSON.stringify(parent.write_scope_attestation_json || {}),
      source_unlock_legal_policy_hold_hash: parent.unlock_legal_policy_hold_hash || 'lph_hash_dummy',
      source_unlock_risk_officer_countersign_hash: parent.unlock_risk_officer_countersign_hash || 'roc_hash_dummy',
      source_unlock_compliance_witness_hash: parent.unlock_compliance_witness_hash || 'cwn_hash_dummy',
      source_unlock_final_human_authorization_seal_hash: parent.unlock_final_human_authorization_seal_hash || 'fhas_hash_dummy',
      source_unlock_dual_control_authorization_hash: parent.source_unlock_dual_control_authorization_hash || 'dcau_hash_dummy',
      source_unlock_operator_attestation_hash: parent.source_unlock_operator_attestation_hash || 'oatt_hash_dummy',
      source_unlock_pre_execution_freeze_hash: parent.source_unlock_pre_execution_freeze_hash || 'pfrz_hash_dummy',
      source_unlock_seal_hash: parent.source_unlock_seal_hash || 'seal_hash_dummy',
      source_unlock_final_review_hash: parent.source_unlock_final_review_hash || 'frev_hash_dummy',
      source_unlock_approval_hash: parent.source_unlock_approval_hash || 'apv_hash_dummy',
      source_unlock_eligibility_hash: parent.source_unlock_eligibility_hash || 'elig_hash_dummy',
      source_redemption_lock_hash: parent.source_redemption_lock_hash || 'lock_hash_dummy',
      source_redemption_final_approval_hash: parent.source_redemption_final_approval_hash || 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: parent.source_redemption_package_freeze_hash || 'freeze_hash_dummy',
      source_token_material_hash: parent.source_token_material_hash || 'token_material_hash_dummy',
      unlock_emergency_rollback_authority_hash: crypto.randomBytes(32).toString('hex'),
      unlock_emergency_rollback_authority_evidence_pack_hash: '',
      evidence_pack_hash: '',
      lineage_hash_chain_json: '{}',
      security_signature_json: '{}',
      attestation_rationale_json: '{}',
      execution_capability_status: parent.execution_capability_status,
      activation_execution_status: 'UNLOCK_LEGAL_POLICY_HOLD_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: parent.package_freeze_status,
      redemption_package_freeze_status: parent.redemption_package_freeze_status,
      plan_executable_status: parent.plan_executable_status,
      job_creation_status: parent.job_creation_status,
      queue_dispatch_status: parent.queue_dispatch_status,
      runtime_mutation_status: parent.runtime_mutation_status,
      primary_authorizer_id: parent.primary_authorizer_id,
      secondary_authorizer_id: parent.secondary_authorizer_id,
      final_human_authorizer_id: parent.final_human_authorizer_id,
      compliance_witness_id: parent.compliance_witness_id,
      risk_officer_id: parent.risk_officer_id,
      legal_policy_officer_id: parent.legal_policy_officer_id,
      created_by: actorId,
      updated_by: actorId
    };

    if (!isProdLike) {
      this._mockState.tokenRedemptionUnlockEmergencyRollbackAuthority.set(unlockEmergencyRollbackAuthorityId, draft);
    } else {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_era
         (act_token_redempt_unlock_emergency_rollback_authority_id, source_act_token_redempt_unlock_legal_policy_hold_id, source_act_token_redempt_unlock_risk_officer_countersign_id, source_act_token_redempt_unlock_compliance_witness_id, source_act_token_redempt_unlock_final_human_auth_seal_id, source_act_token_redempt_unlock_dual_control_authorization_id, source_act_token_redempt_unlock_operator_attestation_id, source_act_token_redempt_unlock_pre_execution_freeze_id, source_activation_token_redemption_unlock_seal_id, source_activation_token_redemption_unlock_final_review_id, source_activation_token_redemption_unlock_approval_id, source_activation_token_redemption_unlock_eligibility_id, source_activation_token_redemption_lock_id, source_activation_token_redemption_final_apv_id, source_activation_token_redemption_envelope_id, source_activation_token_redemption_auth_id, source_activation_token_redemption_readiness_id, source_activation_token_issuance_id, source_activation_token_staging_id, source_activation_token_preflight_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, cohort_id, tenant_id, simulation_type, unlock_emergency_rollback_authority_status, unlock_emergency_rollback_authority_result, unlock_emergency_rollback_authority_mode, unlock_legal_policy_hold_status, unlock_risk_officer_countersign_status, unlock_compliance_witness_status, unlock_final_human_authorization_seal_status, unlock_dual_control_authorization_status, unlock_operator_attestation_status, unlock_pre_execution_freeze_status, unlock_seal_status, unlock_final_review_status, unlock_approval_status, unlock_eligibility_status, token_redemption_lock_status, token_redemption_status, token_unlock_status, token_redeemable_status, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status, write_scope_status, canary_envelope_json, unlock_emergency_rollback_authority_summary_json, impact_review_json, rollback_review_json, guardrail_review_json, unlock_emergency_rollback_authority_rules_json, unlock_emergency_rollback_authority_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_unlock_legal_policy_hold_hash, source_unlock_risk_officer_countersign_hash, source_unlock_compliance_witness_hash, source_unlock_final_human_authorization_seal_hash, source_unlock_dual_control_authorization_hash, source_unlock_operator_attestation_hash, source_unlock_pre_execution_freeze_hash, source_unlock_seal_hash, source_unlock_final_review_hash, source_unlock_approval_hash, source_unlock_eligibility_hash, source_redemption_lock_hash, source_redemption_final_approval_hash, source_redemption_package_freeze_hash, source_token_material_hash, unlock_emergency_rollback_authority_hash, unlock_emergency_rollback_authority_evidence_pack_hash, evidence_pack_hash, lineage_hash_chain_json, security_signature_json, attestation_rationale_json, execution_capability_status, activation_execution_status, package_freeze_status, redemption_package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, primary_authorizer_id, secondary_authorizer_id, final_human_authorizer_id, compliance_witness_id, risk_officer_id, legal_policy_officer_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [draft.act_token_redempt_unlock_emergency_rollback_authority_id, draft.source_act_token_redempt_unlock_legal_policy_hold_id, draft.source_act_token_redempt_unlock_risk_officer_countersign_id, draft.source_act_token_redempt_unlock_compliance_witness_id, draft.source_act_token_redempt_unlock_final_human_auth_seal_id, draft.source_act_token_redempt_unlock_dual_control_authorization_id, draft.source_act_token_redempt_unlock_operator_attestation_id, draft.source_act_token_redempt_unlock_pre_execution_freeze_id, draft.source_activation_token_redemption_unlock_seal_id, draft.source_activation_token_redemption_unlock_final_review_id, draft.source_activation_token_redemption_unlock_approval_id, draft.source_activation_token_redemption_unlock_eligibility_id, draft.source_activation_token_redemption_lock_id, draft.source_activation_token_redemption_final_apv_id, draft.source_activation_token_redemption_envelope_id, draft.source_activation_token_redemption_auth_id, draft.source_activation_token_redemption_readiness_id, draft.source_activation_token_issuance_id, draft.source_activation_token_staging_id, draft.source_activation_token_preflight_id, draft.source_plan_id, draft.source_dispatcher_id, draft.source_envelope_id, draft.source_auth_id, draft.source_readiness_id, draft.source_approval_id, draft.source_prep_id, draft.cohort_id, draft.tenant_id, draft.simulation_type, draft.unlock_emergency_rollback_authority_status, draft.unlock_emergency_rollback_authority_result, draft.unlock_emergency_rollback_authority_mode, draft.unlock_legal_policy_hold_status, draft.unlock_risk_officer_countersign_status, draft.unlock_compliance_witness_status, draft.unlock_final_human_authorization_seal_status, draft.unlock_dual_control_authorization_status, draft.unlock_operator_attestation_status, draft.unlock_pre_execution_freeze_status, draft.unlock_seal_status, draft.unlock_final_review_status, draft.unlock_approval_status, draft.unlock_eligibility_status, draft.token_redemption_lock_status, draft.token_redemption_status, draft.token_unlock_status, draft.token_redeemable_status, draft.risk_level, draft.confidence_level, draft.projected_impact_score, draft.rollback_feasibility_score, draft.evidence_completeness_score, draft.guardrail_status, draft.write_scope_status, draft.canary_envelope_json, draft.unlock_emergency_rollback_authority_summary_json, draft.impact_review_json, draft.rollback_review_json, draft.guardrail_review_json, draft.unlock_emergency_rollback_authority_rules_json, draft.unlock_emergency_rollback_authority_blockers_json, draft.non_execution_attestation_json, draft.write_scope_attestation_json, draft.source_unlock_legal_policy_hold_hash, draft.source_unlock_risk_officer_countersign_hash, draft.source_unlock_compliance_witness_hash, draft.source_unlock_final_human_authorization_seal_hash, draft.source_unlock_dual_control_authorization_hash, draft.source_unlock_operator_attestation_hash, draft.source_unlock_pre_execution_freeze_hash, draft.source_unlock_seal_hash, draft.source_unlock_final_review_hash, draft.source_unlock_approval_hash, draft.source_unlock_eligibility_hash, draft.source_redemption_lock_hash, draft.source_redemption_final_approval_hash, draft.source_redemption_package_freeze_hash, draft.source_token_material_hash, draft.unlock_emergency_rollback_authority_hash, draft.unlock_emergency_rollback_authority_evidence_pack_hash, draft.evidence_pack_hash, draft.lineage_hash_chain_json, draft.security_signature_json, draft.attestation_rationale_json, draft.execution_capability_status, draft.activation_execution_status, draft.package_freeze_status, draft.redemption_package_freeze_status, draft.plan_executable_status, draft.job_creation_status, draft.queue_dispatch_status, draft.runtime_mutation_status, draft.primary_authorizer_id, draft.secondary_authorizer_id, draft.final_human_authorizer_id, draft.compliance_witness_id, draft.risk_officer_id, draft.legal_policy_officer_id, draft.created_by, draft.updated_by]
      );
    }

    await auditService.logAction(unlockEmergencyRollbackAuthorityId, 'UNLOCK_EMERGENCY_ROLLBACK_AUTHORITY_DRAFT_CREATED', actorId, { unlockLegalPolicyHoldId });
    return { tokenRedemptionUnlockEmergencyRollbackAuthority: draft };
  }

  async getTokenRedemptionUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId) {
    if (!isProdLike) {
      const record = this._mockState.tokenRedemptionUnlockEmergencyRollbackAuthority.get(unlockEmergencyRollbackAuthorityId);
      if (!record) return null;
      const parsed = { ...record };
      parsed.canary_envelope_json = parseJsonField(parsed.canary_envelope_json, {});
      parsed.unlock_emergency_rollback_authority_summary_json = parseJsonField(parsed.unlock_emergency_rollback_authority_summary_json, {});
      parsed.impact_review_json = parseJsonField(parsed.impact_review_json, {});
      parsed.rollback_review_json = parseJsonField(parsed.rollback_review_json, {});
      parsed.guardrail_review_json = parseJsonField(parsed.guardrail_review_json, {});
      parsed.unlock_emergency_rollback_authority_rules_json = parseJsonField(parsed.unlock_emergency_rollback_authority_rules_json, {});
      parsed.unlock_emergency_rollback_authority_blockers_json = parseJsonField(parsed.unlock_emergency_rollback_authority_blockers_json, {});
      parsed.non_execution_attestation_json = parseJsonField(parsed.non_execution_attestation_json, {});
      parsed.write_scope_attestation_json = parseJsonField(parsed.write_scope_attestation_json, {});
      parsed.lineage_hash_chain_json = parseJsonField(parsed.lineage_hash_chain_json, {});
      parsed.security_signature_json = parseJsonField(parsed.security_signature_json, {});
      parsed.attestation_rationale_json = parseJsonField(parsed.attestation_rationale_json, {});
      parsed.rollback_authority_attestation_json = parseJsonField(parsed.rollback_authority_attestation_json, {});
      parsed.rollback_readiness_snapshot_json = parseJsonField(parsed.rollback_readiness_snapshot_json, {});
      parsed.prior_authorizer_separation_snapshot_json = parseJsonField(parsed.prior_authorizer_separation_snapshot_json, {});
      return parsed;
    }
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_era
       WHERE act_token_redempt_unlock_emergency_rollback_authority_id = ?`,
      [unlockEmergencyRollbackAuthorityId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    r.canary_envelope_json = parseJsonField(r.canary_envelope_json, {});
    r.unlock_emergency_rollback_authority_summary_json = parseJsonField(r.unlock_emergency_rollback_authority_summary_json, {});
    r.impact_review_json = parseJsonField(r.impact_review_json, {});
    r.rollback_review_json = parseJsonField(r.rollback_review_json, {});
    r.guardrail_review_json = parseJsonField(r.guardrail_review_json, {});
    r.unlock_emergency_rollback_authority_rules_json = parseJsonField(r.unlock_emergency_rollback_authority_rules_json, {});
    r.unlock_emergency_rollback_authority_blockers_json = parseJsonField(r.unlock_emergency_rollback_authority_blockers_json, {});
    r.non_execution_attestation_json = parseJsonField(r.non_execution_attestation_json, {});
    r.write_scope_attestation_json = parseJsonField(r.write_scope_attestation_json, {});
    r.lineage_hash_chain_json = parseJsonField(r.lineage_hash_chain_json, {});
    r.security_signature_json = parseJsonField(r.security_signature_json, {});
    r.attestation_rationale_json = parseJsonField(r.attestation_rationale_json, {});
    r.rollback_authority_attestation_json = parseJsonField(r.rollback_authority_attestation_json, {});
    r.rollback_readiness_snapshot_json = parseJsonField(r.rollback_readiness_snapshot_json, {});
    r.prior_authorizer_separation_snapshot_json = parseJsonField(r.prior_authorizer_separation_snapshot_json, {});
    return r;
  }

  async _internalUpdateUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId, fields) {
    const toUpdate = { ...fields, updated_at: new Date() };

    if (!isProdLike) {
      const existing = this._mockState.tokenRedemptionUnlockEmergencyRollbackAuthority.get(unlockEmergencyRollbackAuthorityId);
      if (!existing) throw new Error('Record not found in mock');
      const updated = { ...existing, ...toUpdate };
      this._mockState.tokenRedemptionUnlockEmergencyRollbackAuthority.set(unlockEmergencyRollbackAuthorityId, updated);
      return updated;
    }

    const sqlKeys = [];
    const sqlVals = [];
    for (const [k, v] of Object.entries(toUpdate)) {
      sqlKeys.push(`${k} = ?`);
      if (typeof v === 'object' && v !== null && !(v instanceof Date)) {
        sqlVals.push(JSON.stringify(v));
      } else {
        sqlVals.push(v);
      }
    }
    sqlVals.push(unlockEmergencyRollbackAuthorityId);

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_era
       SET ${sqlKeys.join(', ')}
       WHERE act_token_redempt_unlock_emergency_rollback_authority_id = ?`,
      sqlVals
    );

    return this.getTokenRedemptionUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId);
  }

  async listUnlockEmergencyRollbackAuthorities() {
    if (!isProdLike) {
      return Array.from(this._mockState.tokenRedemptionUnlockEmergencyRollbackAuthority.values());
    }
    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_era ORDER BY created_at DESC`);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityBuilderService(),
  parseJsonField
};
