'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const parentBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldAuditService').serviceInstance;

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

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldBuilderService {
  constructor() {
    this._mockState = {
      tokenRedemptionUnlockLegalPolicyHold: new Map(),
      rules: new Map()
    };
  }

  async createTokenRedemptionUnlockLegalPolicyHoldDraft(unlockRiskOfficerCountersignId, actorId) {
    const parent = await parentBuilder.getTokenRedemptionUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId);
    if (!parent) {
      throw new Error(`Parent risk officer countersign record ${unlockRiskOfficerCountersignId} not found.`);
    }

    if (parent.unlock_risk_officer_countersign_status !== 'FINALIZED') {
      throw new Error(`Parent risk officer countersign must be FINALIZED. Current status: ${parent.unlock_risk_officer_countersign_status}`);
    }

    if (parent.unlock_risk_officer_countersign_result !== 'RISK_OFFICER_COUNTERSIGNED_NOT_UNLOCKED') {
      throw new Error(`Parent risk officer countersign result must be RISK_OFFICER_COUNTERSIGNED_NOT_UNLOCKED. Current result: ${parent.unlock_risk_officer_countersign_result}`);
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

    const unlockLegalPolicyHoldId = 'lph_' + crypto.randomBytes(8).toString('hex');

    const draft = {
      act_token_redempt_unlock_legal_policy_hold_id: unlockLegalPolicyHoldId,
      source_act_token_redempt_unlock_risk_officer_countersign_id: unlockRiskOfficerCountersignId,
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
      unlock_legal_policy_hold_status: 'DRAFT',
      unlock_legal_policy_hold_result: 'LEGAL_POLICY_HOLD_BLOCKED_BY_RISK_COUNTERSIGN',
      unlock_legal_policy_hold_mode: 'LEGAL_POLICY_HOLD_CONFIRMATION_ONLY',
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
      unlock_legal_policy_hold_summary_json: '{}',
      impact_review_json: '{}',
      rollback_review_json: '{}',
      guardrail_review_json: '{}',
      unlock_legal_policy_hold_rules_json: '{}',
      unlock_legal_policy_hold_blockers_json: '{}',
      non_execution_attestation_json: JSON.stringify(parent.non_execution_attestation_json || {}),
      write_scope_attestation_json: JSON.stringify(parent.write_scope_attestation_json || {}),
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
      unlock_legal_policy_hold_hash: crypto.randomBytes(32).toString('hex'),
      unlock_legal_policy_hold_evidence_pack_hash: '',
      evidence_pack_hash: '',
      lineage_hash_chain_json: '{}',
      security_signature_json: '{}',
      attestation_rationale_json: '{}',
      execution_capability_status: parent.execution_capability_status,
      activation_execution_status: 'UNLOCK_RISK_OFFICER_COUNTERSIGN_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
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
      created_by: actorId,
      updated_by: actorId
    };

    if (!isProdLike) {
      this._mockState.tokenRedemptionUnlockLegalPolicyHold.set(unlockLegalPolicyHoldId, draft);
    } else {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_lph
         (act_token_redempt_unlock_legal_policy_hold_id, source_act_token_redempt_unlock_risk_officer_countersign_id, source_act_token_redempt_unlock_compliance_witness_id, source_act_token_redempt_unlock_final_human_auth_seal_id, source_act_token_redempt_unlock_dual_control_authorization_id, source_act_token_redempt_unlock_operator_attestation_id, source_act_token_redempt_unlock_pre_execution_freeze_id, source_activation_token_redemption_unlock_seal_id, source_activation_token_redemption_unlock_final_review_id, source_activation_token_redemption_unlock_approval_id, source_activation_token_redemption_unlock_eligibility_id, source_activation_token_redemption_lock_id, source_activation_token_redemption_final_apv_id, source_activation_token_redemption_envelope_id, source_activation_token_redemption_auth_id, source_activation_token_redemption_readiness_id, source_activation_token_issuance_id, source_activation_token_staging_id, source_activation_token_preflight_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, cohort_id, tenant_id, simulation_type, unlock_legal_policy_hold_status, unlock_legal_policy_hold_result, unlock_legal_policy_hold_mode, unlock_risk_officer_countersign_status, unlock_compliance_witness_status, unlock_final_human_authorization_seal_status, unlock_dual_control_authorization_status, unlock_operator_attestation_status, unlock_pre_execution_freeze_status, unlock_seal_status, unlock_final_review_status, unlock_approval_status, unlock_eligibility_status, token_redemption_lock_status, token_redemption_status, token_unlock_status, token_redeemable_status, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status, write_scope_status, canary_envelope_json, unlock_legal_policy_hold_summary_json, impact_review_json, rollback_review_json, guardrail_review_json, unlock_legal_policy_hold_rules_json, unlock_legal_policy_hold_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_unlock_risk_officer_countersign_hash, source_unlock_compliance_witness_hash, source_unlock_final_human_authorization_seal_hash, source_unlock_dual_control_authorization_hash, source_unlock_operator_attestation_hash, source_unlock_pre_execution_freeze_hash, source_unlock_seal_hash, source_unlock_final_review_hash, source_unlock_approval_hash, source_unlock_eligibility_hash, source_redemption_lock_hash, source_redemption_final_approval_hash, source_redemption_package_freeze_hash, source_token_material_hash, unlock_legal_policy_hold_hash, unlock_legal_policy_hold_evidence_pack_hash, evidence_pack_hash, lineage_hash_chain_json, security_signature_json, attestation_rationale_json, execution_capability_status, activation_execution_status, package_freeze_status, redemption_package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, primary_authorizer_id, secondary_authorizer_id, final_human_authorizer_id, compliance_witness_id, risk_officer_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [draft.act_token_redempt_unlock_legal_policy_hold_id, draft.source_act_token_redempt_unlock_risk_officer_countersign_id, draft.source_act_token_redempt_unlock_compliance_witness_id, draft.source_act_token_redempt_unlock_final_human_auth_seal_id, draft.source_act_token_redempt_unlock_dual_control_authorization_id, draft.source_act_token_redempt_unlock_operator_attestation_id, draft.source_act_token_redempt_unlock_pre_execution_freeze_id, draft.source_activation_token_redemption_unlock_seal_id, draft.source_activation_token_redemption_unlock_final_review_id, draft.source_activation_token_redemption_unlock_approval_id, draft.source_activation_token_redemption_unlock_eligibility_id, draft.source_activation_token_redemption_lock_id, draft.source_activation_token_redemption_final_apv_id, draft.source_activation_token_redemption_envelope_id, draft.source_activation_token_redemption_auth_id, draft.source_activation_token_redemption_readiness_id, draft.source_activation_token_issuance_id, draft.source_activation_token_staging_id, draft.source_activation_token_preflight_id, draft.source_plan_id, draft.source_dispatcher_id, draft.source_envelope_id, draft.source_auth_id, draft.source_readiness_id, draft.source_approval_id, draft.source_prep_id, draft.cohort_id, draft.tenant_id, draft.simulation_type, draft.unlock_legal_policy_hold_status, draft.unlock_legal_policy_hold_result, draft.unlock_legal_policy_hold_mode, draft.unlock_risk_officer_countersign_status, draft.unlock_compliance_witness_status, draft.unlock_final_human_authorization_seal_status, draft.unlock_dual_control_authorization_status, draft.unlock_operator_attestation_status, draft.unlock_pre_execution_freeze_status, draft.unlock_seal_status, draft.unlock_final_review_status, draft.unlock_approval_status, draft.unlock_eligibility_status, draft.token_redemption_lock_status, draft.token_redemption_status, draft.token_unlock_status, draft.token_redeemable_status, draft.risk_level, draft.confidence_level, draft.projected_impact_score, draft.rollback_feasibility_score, draft.evidence_completeness_score, draft.guardrail_status, draft.write_scope_status, draft.canary_envelope_json, draft.unlock_legal_policy_hold_summary_json, draft.impact_review_json, draft.rollback_review_json, draft.guardrail_review_json, draft.unlock_legal_policy_hold_rules_json, draft.unlock_legal_policy_hold_blockers_json, draft.non_execution_attestation_json, draft.write_scope_attestation_json, draft.source_unlock_risk_officer_countersign_hash, draft.source_unlock_compliance_witness_hash, draft.source_unlock_final_human_authorization_seal_hash, draft.source_unlock_dual_control_authorization_hash, draft.source_unlock_operator_attestation_hash, draft.source_unlock_pre_execution_freeze_hash, draft.source_unlock_seal_hash, draft.source_unlock_final_review_hash, draft.source_unlock_approval_hash, draft.source_unlock_eligibility_hash, draft.source_redemption_lock_hash, draft.source_redemption_final_approval_hash, draft.source_redemption_package_freeze_hash, draft.source_token_material_hash, draft.unlock_legal_policy_hold_hash, draft.unlock_legal_policy_hold_evidence_pack_hash, draft.evidence_pack_hash, draft.lineage_hash_chain_json, draft.security_signature_json, draft.attestation_rationale_json, draft.execution_capability_status, draft.activation_execution_status, draft.package_freeze_status, draft.redemption_package_freeze_status, draft.plan_executable_status, draft.job_creation_status, draft.queue_dispatch_status, draft.runtime_mutation_status, draft.primary_authorizer_id, draft.secondary_authorizer_id, draft.final_human_authorizer_id, draft.compliance_witness_id, draft.risk_officer_id, draft.created_by, draft.updated_by]
      );
    }

    await auditService.logAction(unlockLegalPolicyHoldId, 'UNLOCK_LEGAL_POLICY_HOLD_DRAFT_CREATED', actorId, { unlockRiskOfficerCountersignId });
    return { tokenRedemptionUnlockLegalPolicyHold: draft };
  }

  async getTokenRedemptionUnlockLegalPolicyHold(unlockLegalPolicyHoldId) {
    if (!isProdLike) {
      const record = this._mockState.tokenRedemptionUnlockLegalPolicyHold.get(unlockLegalPolicyHoldId);
      if (!record) return null;
      const parsed = { ...record };
      parsed.canary_envelope_json = parseJsonField(parsed.canary_envelope_json, {});
      parsed.unlock_legal_policy_hold_summary_json = parseJsonField(parsed.unlock_legal_policy_hold_summary_json, {});
      parsed.impact_review_json = parseJsonField(parsed.impact_review_json, {});
      parsed.rollback_review_json = parseJsonField(parsed.rollback_review_json, {});
      parsed.guardrail_review_json = parseJsonField(parsed.guardrail_review_json, {});
      parsed.unlock_legal_policy_hold_rules_json = parseJsonField(parsed.unlock_legal_policy_hold_rules_json, {});
      parsed.unlock_legal_policy_hold_blockers_json = parseJsonField(parsed.unlock_legal_policy_hold_blockers_json, {});
      parsed.non_execution_attestation_json = parseJsonField(parsed.non_execution_attestation_json, {});
      parsed.write_scope_attestation_json = parseJsonField(parsed.write_scope_attestation_json, {});
      parsed.lineage_hash_chain_json = parseJsonField(parsed.lineage_hash_chain_json, {});
      parsed.security_signature_json = parseJsonField(parsed.security_signature_json, {});
      parsed.attestation_rationale_json = parseJsonField(parsed.attestation_rationale_json, {});
      parsed.legal_policy_hold_attestation_json = parseJsonField(parsed.legal_policy_hold_attestation_json, {});
      parsed.legal_policy_hold_registry_snapshot_json = parseJsonField(parsed.legal_policy_hold_registry_snapshot_json, {});
      parsed.prior_authorizer_separation_snapshot_json = parseJsonField(parsed.prior_authorizer_separation_snapshot_json, {});
      return parsed;
    }
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_lph
       WHERE act_token_redempt_unlock_legal_policy_hold_id = ?`,
      [unlockLegalPolicyHoldId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    r.canary_envelope_json = parseJsonField(r.canary_envelope_json, {});
    r.unlock_legal_policy_hold_summary_json = parseJsonField(r.unlock_legal_policy_hold_summary_json, {});
    r.impact_review_json = parseJsonField(r.impact_review_json, {});
    r.rollback_review_json = parseJsonField(r.rollback_review_json, {});
    r.guardrail_review_json = parseJsonField(r.guardrail_review_json, {});
    r.unlock_legal_policy_hold_rules_json = parseJsonField(r.unlock_legal_policy_hold_rules_json, {});
    r.unlock_legal_policy_hold_blockers_json = parseJsonField(r.unlock_legal_policy_hold_blockers_json, {});
    r.non_execution_attestation_json = parseJsonField(r.non_execution_attestation_json, {});
    r.write_scope_attestation_json = parseJsonField(r.write_scope_attestation_json, {});
    r.lineage_hash_chain_json = parseJsonField(r.lineage_hash_chain_json, {});
    r.security_signature_json = parseJsonField(r.security_signature_json, {});
    r.attestation_rationale_json = parseJsonField(r.attestation_rationale_json, {});
    r.legal_policy_hold_attestation_json = parseJsonField(r.legal_policy_hold_attestation_json, {});
    r.legal_policy_hold_registry_snapshot_json = parseJsonField(r.legal_policy_hold_registry_snapshot_json, {});
    r.prior_authorizer_separation_snapshot_json = parseJsonField(r.prior_authorizer_separation_snapshot_json, {});
    return r;
  }

  async _internalUpdateUnlockLegalPolicyHold(unlockLegalPolicyHoldId, fields) {
    const toUpdate = { ...fields, updated_at: new Date() };

    if (!isProdLike) {
      const existing = this._mockState.tokenRedemptionUnlockLegalPolicyHold.get(unlockLegalPolicyHoldId);
      if (!existing) throw new Error('Record not found in mock');
      const updated = { ...existing, ...toUpdate };
      this._mockState.tokenRedemptionUnlockLegalPolicyHold.set(unlockLegalPolicyHoldId, updated);
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
    sqlVals.push(unlockLegalPolicyHoldId);

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_lph
       SET ${sqlKeys.join(', ')}
       WHERE act_token_redempt_unlock_legal_policy_hold_id = ?`,
      sqlVals
    );

    return this.getTokenRedemptionUnlockLegalPolicyHold(unlockLegalPolicyHoldId);
  }

  async listUnlockLegalPolicyHolds() {
    if (!isProdLike) {
      return Array.from(this._mockState.tokenRedemptionUnlockLegalPolicyHold.values());
    }
    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_lph ORDER BY created_at DESC`);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldBuilderService(),
  parseJsonField
};
