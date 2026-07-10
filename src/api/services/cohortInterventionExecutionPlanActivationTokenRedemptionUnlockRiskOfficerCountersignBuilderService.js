'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const parentBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignAuditService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignBuilderService {
  constructor() {
    this._mockState = {
      tokenRedemptionUnlockRiskOfficerCountersign: new Map(),
      rules: new Map()
    };
  }

  async createTokenRedemptionUnlockRiskOfficerCountersignDraft(unlockComplianceWitnessId, actorId) {
    const parent = await parentBuilder.getTokenRedemptionUnlockComplianceWitness(unlockComplianceWitnessId);
    if (!parent) {
      throw new Error(`Parent compliance witness record ${unlockComplianceWitnessId} not found.`);
    }

    if (parent.unlock_compliance_witness_status !== 'FINALIZED') {
      throw new Error(`Parent compliance witness must be FINALIZED. Current status: ${parent.unlock_compliance_witness_status}`);
    }

    if (parent.unlock_compliance_witness_result !== 'COMPLIANCE_WITNESSED_NOT_UNLOCKED') {
      throw new Error(`Parent compliance witness result must be COMPLIANCE_WITNESSED_NOT_UNLOCKED. Current result: ${parent.unlock_compliance_witness_result}`);
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

    const unlockRiskOfficerCountersignId = 'roc_' + crypto.randomBytes(8).toString('hex');

    const draft = {
      act_token_redempt_unlock_risk_officer_countersign_id: unlockRiskOfficerCountersignId,
      source_act_token_redempt_unlock_compliance_witness_id: unlockComplianceWitnessId,
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
      source_review_id: parent.source_review_id,
      source_simulation_id: parent.source_simulation_id,
      source_execution_id: parent.source_execution_id,
      cohort_id: parent.cohort_id,
      tenant_id: parent.tenant_id,
      simulation_type: parent.simulation_type,
      unlock_risk_officer_countersign_status: 'DRAFT',
      unlock_risk_officer_countersign_result: 'RISK_OFFICER_COUNTERSIGN_BLOCKED_BY_COMPLIANCE_WITNESS',
      unlock_risk_officer_countersign_mode: 'RISK_OFFICER_COUNTERSIGN_ONLY',
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
      unlock_risk_officer_countersign_summary_json: '{}',
      impact_review_json: '{}',
      rollback_review_json: '{}',
      guardrail_review_json: '{}',
      unlock_risk_officer_countersign_rules_json: '{}',
      unlock_risk_officer_countersign_blockers_json: '{}',
      non_execution_attestation_json: JSON.stringify(parent.non_execution_attestation_json || {}),
      write_scope_attestation_json: JSON.stringify(parent.write_scope_attestation_json || {}),
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
      unlock_risk_officer_countersign_hash: crypto.randomBytes(32).toString('hex'),
      unlock_risk_officer_countersign_evidence_pack_hash: '',
      evidence_pack_hash: '',
      lineage_hash_chain_json: '{}',
      security_signature_json: '{}',
      attestation_rationale_json: '{}',
      execution_capability_status: parent.execution_capability_status,
      activation_execution_status: 'UNLOCK_COMPLIANCE_WITNESS_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
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
      created_by: actorId,
      updated_by: actorId
    };

    if (!isProdLike) {
      this._mockState.tokenRedemptionUnlockRiskOfficerCountersign.set(unlockRiskOfficerCountersignId, draft);
    } else {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_roc
         (act_token_redempt_unlock_risk_officer_countersign_id, source_act_token_redempt_unlock_compliance_witness_id, source_act_token_redempt_unlock_final_human_auth_seal_id, source_act_token_redempt_unlock_dual_control_authorization_id, source_act_token_redempt_unlock_operator_attestation_id, source_act_token_redempt_unlock_pre_execution_freeze_id, source_activation_token_redemption_unlock_seal_id, source_activation_token_redemption_unlock_final_review_id, source_activation_token_redemption_unlock_approval_id, source_activation_token_redemption_unlock_eligibility_id, source_activation_token_redemption_lock_id, source_activation_token_redemption_final_apv_id, source_activation_token_redemption_envelope_id, source_activation_token_redemption_auth_id, source_activation_token_redemption_readiness_id, source_activation_token_issuance_id, source_activation_token_staging_id, source_activation_token_preflight_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, cohort_id, tenant_id, simulation_type, unlock_risk_officer_countersign_status, unlock_risk_officer_countersign_result, unlock_risk_officer_countersign_mode, unlock_compliance_witness_status, unlock_final_human_authorization_seal_status, unlock_dual_control_authorization_status, unlock_operator_attestation_status, unlock_pre_execution_freeze_status, unlock_seal_status, unlock_final_review_status, unlock_approval_status, unlock_eligibility_status, token_redemption_lock_status, token_redemption_status, token_unlock_status, token_redeemable_status, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score, guardrail_status, write_scope_status, canary_envelope_json, unlock_risk_officer_countersign_summary_json, impact_review_json, rollback_review_json, guardrail_review_json, unlock_risk_officer_countersign_rules_json, unlock_risk_officer_countersign_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_unlock_compliance_witness_hash, source_unlock_final_human_authorization_seal_hash, source_unlock_dual_control_authorization_hash, source_unlock_operator_attestation_hash, source_unlock_pre_execution_freeze_hash, source_unlock_seal_hash, source_unlock_final_review_hash, source_unlock_approval_hash, source_unlock_eligibility_hash, source_redemption_lock_hash, source_redemption_final_approval_hash, source_redemption_package_freeze_hash, source_token_material_hash, unlock_risk_officer_countersign_hash, unlock_risk_officer_countersign_evidence_pack_hash, evidence_pack_hash, lineage_hash_chain_json, security_signature_json, attestation_rationale_json, execution_capability_status, activation_execution_status, package_freeze_status, redemption_package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, primary_authorizer_id, secondary_authorizer_id, final_human_authorizer_id, compliance_witness_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [draft.act_token_redempt_unlock_risk_officer_countersign_id, draft.source_act_token_redempt_unlock_compliance_witness_id, draft.source_act_token_redempt_unlock_final_human_auth_seal_id, draft.source_act_token_redempt_unlock_dual_control_authorization_id, draft.source_act_token_redempt_unlock_operator_attestation_id, draft.source_act_token_redempt_unlock_pre_execution_freeze_id, draft.source_activation_token_redemption_unlock_seal_id, draft.source_activation_token_redemption_unlock_final_review_id, draft.source_activation_token_redemption_unlock_approval_id, draft.source_activation_token_redemption_unlock_eligibility_id, draft.source_activation_token_redemption_lock_id, draft.source_activation_token_redemption_final_apv_id, draft.source_activation_token_redemption_envelope_id, draft.source_activation_token_redemption_auth_id, draft.source_activation_token_redemption_readiness_id, draft.source_activation_token_issuance_id, draft.source_activation_token_staging_id, draft.source_activation_token_preflight_id, draft.source_plan_id, draft.source_dispatcher_id, draft.source_envelope_id, draft.source_auth_id, draft.source_readiness_id, draft.source_approval_id, draft.source_prep_id, draft.cohort_id, draft.tenant_id, draft.simulation_type, draft.unlock_risk_officer_countersign_status, draft.unlock_risk_officer_countersign_result, draft.unlock_risk_officer_countersign_mode, draft.unlock_compliance_witness_status, draft.unlock_final_human_authorization_seal_status, draft.unlock_dual_control_authorization_status, draft.unlock_operator_attestation_status, draft.unlock_pre_execution_freeze_status, draft.unlock_seal_status, draft.unlock_final_review_status, draft.unlock_approval_status, draft.unlock_eligibility_status, draft.token_redemption_lock_status, draft.token_redemption_status, draft.token_unlock_status, draft.token_redeemable_status, draft.risk_level, draft.confidence_level, draft.projected_impact_score, draft.rollback_feasibility_score, draft.evidence_completeness_score, draft.guardrail_status, draft.write_scope_status, draft.canary_envelope_json, draft.unlock_risk_officer_countersign_summary_json, draft.impact_review_json, draft.rollback_review_json, draft.guardrail_review_json, draft.unlock_risk_officer_countersign_rules_json, draft.unlock_risk_officer_countersign_blockers_json, draft.non_execution_attestation_json, draft.write_scope_attestation_json, draft.source_unlock_compliance_witness_hash, draft.source_unlock_final_human_authorization_seal_hash, draft.source_unlock_dual_control_authorization_hash, draft.source_unlock_operator_attestation_hash, draft.source_unlock_pre_execution_freeze_hash, draft.source_unlock_seal_hash, draft.source_unlock_final_review_hash, draft.source_unlock_approval_hash, draft.source_unlock_eligibility_hash, draft.source_redemption_lock_hash, draft.source_redemption_final_approval_hash, draft.source_redemption_package_freeze_hash, draft.source_token_material_hash, draft.unlock_risk_officer_countersign_hash, draft.unlock_risk_officer_countersign_evidence_pack_hash, draft.evidence_pack_hash, draft.lineage_hash_chain_json, draft.security_signature_json, draft.attestation_rationale_json, draft.execution_capability_status, draft.activation_execution_status, draft.package_freeze_status, draft.redemption_package_freeze_status, draft.plan_executable_status, draft.job_creation_status, draft.queue_dispatch_status, draft.runtime_mutation_status, draft.primary_authorizer_id, draft.secondary_authorizer_id, draft.final_human_authorizer_id, draft.compliance_witness_id, draft.created_by, draft.updated_by]
      );
    }

    await auditService.logAction(unlockRiskOfficerCountersignId, 'UNLOCK_RISK_OFFICER_COUNTERSIGN_DRAFT_CREATED', actorId, { unlockComplianceWitnessId });
    return { tokenRedemptionUnlockRiskOfficerCountersign: draft };
  }

  async getTokenRedemptionUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId) {
    if (!isProdLike) {
      const record = this._mockState.tokenRedemptionUnlockRiskOfficerCountersign.get(unlockRiskOfficerCountersignId);
      if (!record) return null;
      // parse JSON properties for mock consistency
      const parsed = { ...record };
      if (typeof parsed.canary_envelope_json === 'string') parsed.canary_envelope_json = JSON.parse(parsed.canary_envelope_json);
      if (typeof parsed.unlock_risk_officer_countersign_summary_json === 'string') parsed.unlock_risk_officer_countersign_summary_json = JSON.parse(parsed.unlock_risk_officer_countersign_summary_json);
      if (typeof parsed.impact_review_json === 'string') parsed.impact_review_json = JSON.parse(parsed.impact_review_json);
      if (typeof parsed.rollback_review_json === 'string') parsed.rollback_review_json = JSON.parse(parsed.rollback_review_json);
      if (typeof parsed.guardrail_review_json === 'string') parsed.guardrail_review_json = JSON.parse(parsed.guardrail_review_json);
      if (typeof parsed.unlock_risk_officer_countersign_rules_json === 'string') parsed.unlock_risk_officer_countersign_rules_json = JSON.parse(parsed.unlock_risk_officer_countersign_rules_json);
      if (typeof parsed.unlock_risk_officer_countersign_blockers_json === 'string') parsed.unlock_risk_officer_countersign_blockers_json = JSON.parse(parsed.unlock_risk_officer_countersign_blockers_json);
      if (typeof parsed.non_execution_attestation_json === 'string') parsed.non_execution_attestation_json = JSON.parse(parsed.non_execution_attestation_json);
      if (typeof parsed.write_scope_attestation_json === 'string') parsed.write_scope_attestation_json = JSON.parse(parsed.write_scope_attestation_json);
      if (typeof parsed.lineage_hash_chain_json === 'string') parsed.lineage_hash_chain_json = JSON.parse(parsed.lineage_hash_chain_json);
      if (typeof parsed.security_signature_json === 'string') parsed.security_signature_json = JSON.parse(parsed.security_signature_json);
      if (typeof parsed.attestation_rationale_json === 'string') parsed.attestation_rationale_json = JSON.parse(parsed.attestation_rationale_json);
      if (typeof parsed.risk_officer_countersign_payload_json === 'string') parsed.risk_officer_countersign_payload_json = JSON.parse(parsed.risk_officer_countersign_payload_json);
      if (typeof parsed.safety_snapshot_json === 'string') parsed.safety_snapshot_json = JSON.parse(parsed.safety_snapshot_json);
      if (typeof parsed.risk_officer_countersign_attestation_json === 'string') parsed.risk_officer_countersign_attestation_json = JSON.parse(parsed.risk_officer_countersign_attestation_json);
      if (typeof parsed.prior_authorizer_separation_snapshot_json === 'string') parsed.prior_authorizer_separation_snapshot_json = JSON.parse(parsed.prior_authorizer_separation_snapshot_json);
      return parsed;
    }
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_roc
       WHERE act_token_redempt_unlock_risk_officer_countersign_id = ?`,
      [unlockRiskOfficerCountersignId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    r.canary_envelope_json = JSON.parse(r.canary_envelope_json || '{}');
    r.unlock_risk_officer_countersign_summary_json = JSON.parse(r.unlock_risk_officer_countersign_summary_json || '{}');
    r.impact_review_json = JSON.parse(r.impact_review_json || '{}');
    r.rollback_review_json = JSON.parse(r.rollback_review_json || '{}');
    r.guardrail_review_json = JSON.parse(r.guardrail_review_json || '{}');
    r.unlock_risk_officer_countersign_rules_json = JSON.parse(r.unlock_risk_officer_countersign_rules_json || '{}');
    r.unlock_risk_officer_countersign_blockers_json = JSON.parse(r.unlock_risk_officer_countersign_blockers_json || '{}');
    r.non_execution_attestation_json = JSON.parse(r.non_execution_attestation_json || '{}');
    r.write_scope_attestation_json = JSON.parse(r.write_scope_attestation_json || '{}');
    r.lineage_hash_chain_json = JSON.parse(r.lineage_hash_chain_json || '{}');
    r.security_signature_json = JSON.parse(r.security_signature_json || '{}');
    r.attestation_rationale_json = JSON.parse(r.attestation_rationale_json || '{}');
    r.risk_officer_countersign_payload_json = JSON.parse(r.risk_officer_countersign_payload_json || '{}');
    r.safety_snapshot_json = JSON.parse(r.safety_snapshot_json || '{}');
    r.risk_officer_countersign_attestation_json = JSON.parse(r.risk_officer_countersign_attestation_json || '{}');
    r.prior_authorizer_separation_snapshot_json = JSON.parse(r.prior_authorizer_separation_snapshot_json || '{}');
    return r;
  }

  async _internalUpdateUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId, fields) {
    const toUpdate = { ...fields, updated_at: new Date() };

    if (!isProdLike) {
      const existing = this._mockState.tokenRedemptionUnlockRiskOfficerCountersign.get(unlockRiskOfficerCountersignId);
      if (!existing) throw new Error('Record not found in mock');
      const updated = { ...existing, ...toUpdate };
      this._mockState.tokenRedemptionUnlockRiskOfficerCountersign.set(unlockRiskOfficerCountersignId, updated);
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
    sqlVals.push(unlockRiskOfficerCountersignId);

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_roc
       SET ${sqlKeys.join(', ')}
       WHERE act_token_redempt_unlock_risk_officer_countersign_id = ?`,
      sqlVals
    );
    return await this.getTokenRedemptionUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId);
  }

  async listUnlockRiskOfficerCountersigns() {
    if (!isProdLike) {
      return Array.from(this._mockState.tokenRedemptionUnlockRiskOfficerCountersign.values());
    }
    return await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_roc ORDER BY created_at DESC`);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignBuilderService()
};
