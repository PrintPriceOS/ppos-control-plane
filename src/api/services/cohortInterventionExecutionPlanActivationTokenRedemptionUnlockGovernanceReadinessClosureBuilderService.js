'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const parentBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureAuditService').serviceInstance;

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

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureBuilderService {
  constructor() {
    this._mockState = {
      tokenRedemptionUnlockGovernanceReadinessClosure: new Map(),
      rules: new Map()
    };
  }

  async createTokenRedemptionUnlockGovernanceReadinessClosureDraft(unlockFinalNonExecutionEvidenceSealId, actorId) {
    const parent = await parentBuilder.getTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId);
    if (!parent) {
      throw new Error(`Parent emergency rollback authority record ${unlockFinalNonExecutionEvidenceSealId} not found.`);
    }

    if (parent.unlock_final_non_execution_evidence_seal_status !== 'FINALIZED') {
      throw new Error(`Parent emergency rollback authority must be FINALIZED. Current status: ${parent.unlock_final_non_execution_evidence_seal_status}`);
    }

    if (parent.unlock_final_non_execution_evidence_seal_result !== 'FINAL_NON_EXECUTION_EVIDENCE_SEALED_NOT_UNLOCKED') {
      throw new Error(`Parent emergency rollback authority result must be FINAL_NON_EXECUTION_EVIDENCE_SEALED_NOT_UNLOCKED. Current result: ${parent.unlock_final_non_execution_evidence_seal_result}`);
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

    // Resolve inherited officer IDs
    const eraBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityBuilderService').serviceInstance;
    const eraRecord = await eraBuilder.getTokenRedemptionUnlockEmergencyRollbackAuthority(parent.source_act_token_redempt_unlock_emergency_rollback_authority_id);
    const resolvedRollbackOfficerId = eraRecord ? eraRecord.rollback_officer_id : 'rollback_officer_unresolved_phase180_smoke';
    const resolvedEvidenceSealOfficerId = parent.evidence_seal_officer_id || 'evidence_seal_officer_unresolved_phase180_smoke';

    const unlockGovernanceReadinessClosureId = 'grc_' + crypto.randomBytes(8).toString('hex');

    const draft = {
      act_token_redempt_unlock_governance_readiness_closure_id: unlockGovernanceReadinessClosureId,
      source_act_token_redempt_unlock_final_non_execution_evidence_seal_id: unlockFinalNonExecutionEvidenceSealId,
      source_act_token_redempt_unlock_kill_switch_dry_run_id: parent.source_act_token_redempt_unlock_kill_switch_dry_run_id,
      source_act_token_redempt_unlock_emergency_rollback_authority_id: parent.source_act_token_redempt_unlock_emergency_rollback_authority_id,
      source_act_token_redempt_unlock_legal_policy_hold_id: parent.source_act_token_redempt_unlock_legal_policy_hold_id,
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
      unlock_governance_readiness_closure_status: 'DRAFT',
      unlock_governance_readiness_closure_result: 'GOVERNANCE_READINESS_CLOSURE_FAILED',
      unlock_governance_readiness_closure_mode: 'GOVERNANCE_READINESS_CLOSURE_ONLY',
      unlock_final_non_execution_evidence_seal_status: parent.unlock_final_non_execution_evidence_seal_status,
      unlock_kill_switch_dry_run_status: parent.unlock_kill_switch_dry_run_status,
      unlock_emergency_rollback_authority_status: parent.unlock_emergency_rollback_authority_status,
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
      canary_envelope_json: parent.canary_envelope_json || {},
      governance_readiness_closure_summary_json: '{}',
      impact_review_json: parent.impact_review_json || {},
      rollback_review_json: parent.rollback_review_json || {},
      guardrail_review_json: parent.guardrail_review_json || {},
      governance_readiness_closure_rules_json: '{}',
      governance_readiness_closure_blockers_json: '{}',
      non_execution_attestation_json: '{}',
      write_scope_attestation_json: '{}',
      source_unlock_final_non_execution_evidence_seal_hash: parent.unlock_final_non_execution_evidence_seal_hash || 'h0',
      source_unlock_kill_switch_dry_run_hash: parent.source_unlock_kill_switch_dry_run_hash || 'h1',
      source_unlock_emergency_rollback_authority_hash: parent.source_unlock_emergency_rollback_authority_hash || 'h2',
      source_unlock_legal_policy_hold_hash: parent.source_unlock_legal_policy_hold_hash || 'h3',
      source_unlock_risk_officer_countersign_hash: parent.source_unlock_risk_officer_countersign_hash || 'h4',
      source_unlock_compliance_witness_hash: parent.source_unlock_compliance_witness_hash || 'h5',
      source_unlock_final_human_authorization_seal_hash: parent.source_unlock_final_human_authorization_seal_hash || 'h6',
      source_unlock_dual_control_authorization_hash: parent.source_unlock_dual_control_authorization_hash || 'h7',
      source_unlock_operator_attestation_hash: parent.source_unlock_operator_attestation_hash || 'h8',
      source_unlock_pre_execution_freeze_hash: parent.source_unlock_pre_execution_freeze_hash || 'h9',
      source_unlock_seal_hash: parent.source_unlock_seal_hash || 'h10',
      source_unlock_final_review_hash: parent.source_unlock_final_review_hash || 'h11',
      source_unlock_approval_hash: parent.source_unlock_approval_hash || 'h12',
      source_unlock_eligibility_hash: parent.source_unlock_eligibility_hash || 'h13',
      source_redemption_lock_hash: parent.source_redemption_lock_hash || 'h14',
      source_redemption_final_approval_hash: parent.source_redemption_final_approval_hash || 'h15',
      source_redemption_package_freeze_hash: parent.source_redemption_package_freeze_hash || 'h16',
      source_token_material_hash: parent.source_token_material_hash || 'h17',
      unlock_governance_readiness_closure_hash: '',
      unlock_governance_readiness_closure_evidence_pack_hash: '',
      evidence_pack_hash: '',
      lineage_hash_chain_json: '{}',
      security_signature_json: '{}',
      attestation_rationale_json: '{}',
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_GOVERNANCE_READINESS_CLOSURE_DRAFT_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      primary_authorizer_id: parent.primary_authorizer_id,
      secondary_authorizer_id: parent.secondary_authorizer_id,
      final_human_authorizer_id: parent.final_human_authorizer_id,
      compliance_witness_id: parent.compliance_witness_id,
      risk_officer_id: parent.risk_officer_id,
      legal_policy_officer_id: parent.legal_policy_officer_id,
      rollback_officer_id: resolvedRollbackOfficerId,
      kill_switch_verification_officer_id: parent.kill_switch_verification_officer_id,
      evidence_seal_officer_id: resolvedEvidenceSealOfficerId,
      governance_closure_officer_id: null,
      governance_closure_officer_role: null,
      governance_closure_confirmed_at: null,
      governance_closure_reason: null,
      governance_readiness_closure_snapshot_json: '{}',
      full_chain_non_execution_snapshot_json: '{}',
      prior_authorizer_separation_snapshot_json: '{}',
      created_by: actorId,
      updated_by: actorId
    };

    if (!isProdLike) {
      this._mockState.tokenRedemptionUnlockGovernanceReadinessClosure.set(unlockGovernanceReadinessClosureId, draft);
      this._mockState.rules.set(unlockGovernanceReadinessClosureId, []);
    } else {
      const fields = [
        'act_token_redempt_unlock_governance_readiness_closure_id', 'source_act_token_redempt_unlock_final_non_execution_evidence_seal_id', 'source_act_token_redempt_unlock_kill_switch_dry_run_id', 'source_act_token_redempt_unlock_emergency_rollback_authority_id', 'source_act_token_redempt_unlock_legal_policy_hold_id', 'source_act_token_redempt_unlock_risk_officer_countersign_id', 'source_act_token_redempt_unlock_compliance_witness_id', 'source_act_token_redempt_unlock_final_human_auth_seal_id', 'source_act_token_redempt_unlock_dual_control_authorization_id', 'source_act_token_redempt_unlock_operator_attestation_id', 'source_act_token_redempt_unlock_pre_execution_freeze_id', 'source_activation_token_redemption_unlock_seal_id', 'source_activation_token_redemption_unlock_final_review_id', 'source_activation_token_redemption_unlock_approval_id', 'source_activation_token_redemption_unlock_eligibility_id', 'source_activation_token_redemption_lock_id', 'source_activation_token_redemption_final_apv_id', 'source_activation_token_redemption_envelope_id', 'source_activation_token_redemption_auth_id', 'source_activation_token_redemption_readiness_id', 'source_activation_token_issuance_id', 'source_activation_token_staging_id', 'source_activation_token_preflight_id', 'source_plan_id', 'source_dispatcher_id', 'source_envelope_id', 'source_auth_id', 'source_readiness_id', 'source_approval_id', 'source_prep_id', 'cohort_id', 'tenant_id', 'simulation_type', 'unlock_governance_readiness_closure_status', 'unlock_governance_readiness_closure_result', 'unlock_governance_readiness_closure_mode', 'unlock_final_non_execution_evidence_seal_status', 'unlock_kill_switch_dry_run_status', 'unlock_emergency_rollback_authority_status', 'unlock_legal_policy_hold_status', 'unlock_risk_officer_countersign_status', 'unlock_compliance_witness_status', 'unlock_final_human_authorization_seal_status', 'unlock_dual_control_authorization_status', 'unlock_operator_attestation_status', 'unlock_pre_execution_freeze_status', 'unlock_seal_status', 'unlock_final_review_status', 'unlock_approval_status', 'unlock_eligibility_status', 'token_redemption_lock_status', 'token_redemption_status', 'token_unlock_status', 'token_redeemable_status', 'risk_level', 'confidence_level', 'projected_impact_score', 'rollback_feasibility_score', 'evidence_completeness_score', 'guardrail_status', 'write_scope_status', 'canary_envelope_json', 'governance_readiness_closure_summary_json', 'impact_review_json', 'rollback_review_json', 'guardrail_review_json', 'governance_readiness_closure_rules_json', 'governance_readiness_closure_blockers_json', 'non_execution_attestation_json', 'write_scope_attestation_json', 'source_unlock_final_non_execution_evidence_seal_hash', 'source_unlock_kill_switch_dry_run_hash', 'source_unlock_emergency_rollback_authority_hash', 'source_unlock_legal_policy_hold_hash', 'source_unlock_risk_officer_countersign_hash', 'source_unlock_compliance_witness_hash', 'source_unlock_final_human_authorization_seal_hash', 'source_unlock_dual_control_authorization_hash', 'source_unlock_operator_attestation_hash', 'source_unlock_pre_execution_freeze_hash', 'source_unlock_seal_hash', 'source_unlock_final_review_hash', 'source_unlock_approval_hash', 'source_unlock_eligibility_hash', 'source_redemption_lock_hash', 'source_redemption_final_approval_hash', 'source_redemption_package_freeze_hash', 'source_token_material_hash', 'unlock_governance_readiness_closure_hash', 'unlock_governance_readiness_closure_evidence_pack_hash', 'evidence_pack_hash', 'lineage_hash_chain_json', 'security_signature_json', 'attestation_rationale_json', 'execution_capability_status', 'activation_execution_status', 'package_freeze_status', 'redemption_package_freeze_status', 'plan_executable_status', 'job_creation_status', 'queue_dispatch_status', 'runtime_mutation_status', 'primary_authorizer_id', 'secondary_authorizer_id', 'final_human_authorizer_id', 'compliance_witness_id', 'risk_officer_id', 'legal_policy_officer_id', 'rollback_officer_id', 'kill_switch_verification_officer_id', 'evidence_seal_officer_id', 'created_by', 'updated_by'
      ];
      const placeholders = fields.map(() => '?').join(', ');
      const values = [
        draft.act_token_redempt_unlock_governance_readiness_closure_id, draft.source_act_token_redempt_unlock_final_non_execution_evidence_seal_id, draft.source_act_token_redempt_unlock_kill_switch_dry_run_id, draft.source_act_token_redempt_unlock_emergency_rollback_authority_id, draft.source_act_token_redempt_unlock_legal_policy_hold_id, draft.source_act_token_redempt_unlock_risk_officer_countersign_id, draft.source_act_token_redempt_unlock_compliance_witness_id, draft.source_act_token_redempt_unlock_final_human_auth_seal_id, draft.source_act_token_redempt_unlock_dual_control_authorization_id, draft.source_act_token_redempt_unlock_operator_attestation_id, draft.source_act_token_redempt_unlock_pre_execution_freeze_id, draft.source_activation_token_redemption_unlock_seal_id, draft.source_activation_token_redemption_unlock_final_review_id, draft.source_activation_token_redemption_unlock_approval_id, draft.source_activation_token_redemption_unlock_eligibility_id, draft.source_activation_token_redemption_lock_id, draft.source_activation_token_redemption_final_apv_id, draft.source_activation_token_redemption_envelope_id, draft.source_activation_token_redemption_auth_id, draft.source_activation_token_redemption_readiness_id, draft.source_activation_token_issuance_id, draft.source_activation_token_staging_id, draft.source_activation_token_preflight_id, draft.source_plan_id, draft.source_dispatcher_id, draft.source_envelope_id, draft.source_auth_id, draft.source_readiness_id, draft.source_approval_id, draft.source_prep_id, draft.cohort_id, draft.tenant_id, draft.simulation_type, draft.unlock_governance_readiness_closure_status, draft.unlock_governance_readiness_closure_result, draft.unlock_governance_readiness_closure_mode, draft.unlock_final_non_execution_evidence_seal_status, draft.unlock_kill_switch_dry_run_status, draft.unlock_emergency_rollback_authority_status, draft.unlock_legal_policy_hold_status, draft.unlock_risk_officer_countersign_status, draft.unlock_compliance_witness_status, draft.unlock_final_human_authorization_seal_status, draft.unlock_dual_control_authorization_status, draft.unlock_operator_attestation_status, draft.unlock_pre_execution_freeze_status, draft.unlock_seal_status, draft.unlock_final_review_status, draft.unlock_approval_status, draft.unlock_eligibility_status, draft.token_redemption_lock_status, draft.token_redemption_status, draft.token_unlock_status, draft.token_redeemable_status, draft.risk_level, draft.confidence_level, draft.projected_impact_score, draft.rollback_feasibility_score, draft.evidence_completeness_score, draft.guardrail_status, draft.write_scope_status, JSON.stringify(draft.canary_envelope_json), draft.governance_readiness_closure_summary_json, JSON.stringify(draft.impact_review_json), JSON.stringify(draft.rollback_review_json), JSON.stringify(draft.guardrail_review_json), draft.governance_readiness_closure_rules_json, draft.governance_readiness_closure_blockers_json, draft.non_execution_attestation_json, draft.write_scope_attestation_json, draft.source_unlock_final_non_execution_evidence_seal_hash, draft.source_unlock_kill_switch_dry_run_hash, draft.source_unlock_emergency_rollback_authority_hash, draft.source_unlock_legal_policy_hold_hash, draft.source_unlock_risk_officer_countersign_hash, draft.source_unlock_compliance_witness_hash, draft.source_unlock_final_human_authorization_seal_hash, draft.source_unlock_dual_control_authorization_hash, draft.source_unlock_operator_attestation_hash, draft.source_unlock_pre_execution_freeze_hash, draft.source_unlock_seal_hash, draft.source_unlock_final_review_hash, draft.source_unlock_approval_hash, draft.source_unlock_eligibility_hash, draft.source_redemption_lock_hash, draft.source_redemption_final_approval_hash, draft.source_redemption_package_freeze_hash, draft.source_token_material_hash, draft.unlock_governance_readiness_closure_hash, draft.unlock_governance_readiness_closure_evidence_pack_hash, draft.evidence_pack_hash, draft.lineage_hash_chain_json, JSON.stringify(draft.security_signature_json), JSON.stringify(draft.attestation_rationale_json), draft.execution_capability_status, draft.activation_execution_status, draft.package_freeze_status, draft.redemption_package_freeze_status, draft.plan_executable_status, draft.job_creation_status, draft.queue_dispatch_status, draft.runtime_mutation_status, draft.primary_authorizer_id, draft.secondary_authorizer_id, draft.final_human_authorizer_id, draft.compliance_witness_id, draft.risk_officer_id, draft.legal_policy_officer_id, draft.rollback_officer_id, draft.kill_switch_verification_officer_id, draft.evidence_seal_officer_id, actorId, actorId
      ];
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_grc
         (${fields.join(', ')})
         VALUES (${placeholders})`,
        values
      );
    }

    await auditService.logAction(unlockGovernanceReadinessClosureId, 'UNLOCK_GOVERNANCE_READINESS_CLOSURE_DRAFT_CREATED', actorId);

    return { tokenRedemptionUnlockGovernanceReadinessClosure: draft };
  }

  async getTokenRedemptionUnlockGovernanceReadinessClosure(id) {
    if (!isProdLike) {
      return this._mockState.tokenRedemptionUnlockGovernanceReadinessClosure.get(id) || null;
    }
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_grc
       WHERE act_token_redempt_unlock_governance_readiness_closure_id = ?`,
      [id]
    );
    if (!rows.length) return null;
    const r = rows[0];
    r.canary_envelope_json = parseJsonField(r.canary_envelope_json, {});
    r.impact_review_json = parseJsonField(r.impact_review_json, {});
    r.rollback_review_json = parseJsonField(r.rollback_review_json, {});
    r.guardrail_review_json = parseJsonField(r.guardrail_review_json, {});
    r.lineage_hash_chain_json = parseJsonField(r.lineage_hash_chain_json, {});
    r.security_signature_json = parseJsonField(r.security_signature_json, {});
    r.attestation_rationale_json = parseJsonField(r.attestation_rationale_json, {});
    r.governance_readiness_closure_snapshot_json = parseJsonField(r.governance_readiness_closure_snapshot_json, {});
    r.full_chain_non_execution_snapshot_json = parseJsonField(r.full_chain_non_execution_snapshot_json, {});
    r.prior_authorizer_separation_snapshot_json = parseJsonField(r.prior_authorizer_separation_snapshot_json, {});
    r.governance_readiness_closure_rules_json = parseJsonField(r.governance_readiness_closure_rules_json, {});
    return r;
  }

  async _internalUpdateTokenRedemptionUnlockGovernanceReadinessClosure(id, updates) {
    if (!isProdLike) {
      const current = this._mockState.tokenRedemptionUnlockGovernanceReadinessClosure.get(id);
      if (!current) throw new Error('Not found');
      Object.assign(current, updates);
      return current;
    }

    const fields = [];
    const params = [];
    for (const [k, v] of Object.entries(updates)) {
      fields.push(`${k} = ?`);
      params.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
    params.push(id);

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_grc
       SET ${fields.join(', ')}
       WHERE act_token_redempt_unlock_governance_readiness_closure_id = ?`,
      params
    );
  }

  async listTokenRedemptionUnlockGovernanceReadinessClosure() {
    if (!isProdLike) {
      return Array.from(this._mockState.tokenRedemptionUnlockGovernanceReadinessClosure.values());
    }
    const rows = await db.query(`SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_grc ORDER BY created_at DESC`);
    return rows.map(r => {
      r.canary_envelope_json = parseJsonField(r.canary_envelope_json, {});
      r.impact_review_json = parseJsonField(r.impact_review_json, {});
      r.rollback_review_json = parseJsonField(r.rollback_review_json, {});
      r.guardrail_review_json = parseJsonField(r.guardrail_review_json, {});
      r.lineage_hash_chain_json = parseJsonField(r.lineage_hash_chain_json, {});
      r.security_signature_json = parseJsonField(r.security_signature_json, {});
      r.attestation_rationale_json = parseJsonField(r.attestation_rationale_json, {});
      r.governance_readiness_closure_snapshot_json = parseJsonField(r.governance_readiness_closure_snapshot_json, {});
      r.full_chain_non_execution_snapshot_json = parseJsonField(r.full_chain_non_execution_snapshot_json, {});
      r.prior_authorizer_separation_snapshot_json = parseJsonField(r.prior_authorizer_separation_snapshot_json, {});
      r.governance_readiness_closure_rules_json = parseJsonField(r.governance_readiness_closure_rules_json, {});
      return r;
    });
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureBuilderService()
};
