'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureBuilderService').serviceInstance;
const parentBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealBuilderService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureEvidencePackService {
  constructor() {
    this._mockState = {
      evidence: new Map()
    };
  }

  async generateEvidencePack(unlockGovernanceReadinessClosureId, actorId) {
    const record = await builder.getTokenRedemptionUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId);
    if (!record) {
      throw new Error(`Record ${unlockGovernanceReadinessClosureId} not found.`);
    }

    const parentFinalNonExecutionEvidenceSeal = await parentBuilder.getTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(record.source_act_token_redempt_unlock_final_non_execution_evidence_seal_id);
    if (!parentFinalNonExecutionEvidenceSeal) {
      throw new Error(`Parent final evidence seal not found.`);
    }

    const hashId = (id) => id ? crypto.createHash('sha256').update(id).digest('hex') : null;

    const lineageHashChain = {
      phase180_unlock_governance_readiness_closure: record.unlock_governance_readiness_closure_hash || record.unlock_governance_readiness_closure_evidence_pack_hash || 'grc_hash_dummy',
      phase179_unlock_final_non_execution_evidence_seal: record.source_unlock_final_non_execution_evidence_seal_hash || parentFinalNonExecutionEvidenceSeal.unlock_final_non_execution_evidence_seal_hash || parentFinalNonExecutionEvidenceSeal.evidence_pack_hash,
      phase178_unlock_kill_switch_dry_run: record.source_unlock_kill_switch_dry_run_hash || parentFinalNonExecutionEvidenceSeal.source_unlock_kill_switch_dry_run_hash,
      phase177_unlock_emergency_rollback_authority: record.source_unlock_emergency_rollback_authority_hash || parentFinalNonExecutionEvidenceSeal.source_unlock_emergency_rollback_authority_hash,
      phase176_unlock_legal_policy_hold: record.source_unlock_legal_policy_hold_hash || parentFinalNonExecutionEvidenceSeal.source_unlock_legal_policy_hold_hash,
      phase175_unlock_risk_officer_countersign: record.source_unlock_risk_officer_countersign_hash || parentFinalNonExecutionEvidenceSeal.source_unlock_risk_officer_countersign_hash,
      phase174_unlock_compliance_witness: record.source_unlock_compliance_witness_hash || parentFinalNonExecutionEvidenceSeal.source_unlock_compliance_witness_hash,
      phase173_unlock_final_human_authorization_seal: record.source_unlock_final_human_authorization_seal_hash || parentFinalNonExecutionEvidenceSeal.source_unlock_final_human_authorization_seal_hash,
      phase172_unlock_dual_control_authorization: record.source_unlock_dual_control_authorization_hash || parentFinalNonExecutionEvidenceSeal.source_unlock_dual_control_authorization_hash,
      phase171_unlock_operator_attestation: record.source_unlock_operator_attestation_hash || parentFinalNonExecutionEvidenceSeal.source_unlock_operator_attestation_hash,
      phase170_unlock_pre_execution_freeze: record.source_unlock_pre_execution_freeze_hash || parentFinalNonExecutionEvidenceSeal.source_unlock_pre_execution_freeze_hash,
      phase169_unlock_readiness_seal: record.source_unlock_seal_hash || parentFinalNonExecutionEvidenceSeal.source_unlock_seal_hash,
      phase168_unlock_final_review: record.source_unlock_final_review_hash || parentFinalNonExecutionEvidenceSeal.source_unlock_final_review_hash,
      phase167_unlock_approval: record.source_unlock_approval_hash || parentFinalNonExecutionEvidenceSeal.source_unlock_approval_hash,
      phase166_unlock_eligibility: record.source_unlock_eligibility_hash || parentFinalNonExecutionEvidenceSeal.source_unlock_eligibility_hash,
      phase165_redemption_lock: record.source_redemption_lock_hash || parentFinalNonExecutionEvidenceSeal.source_redemption_lock_hash,
      phase164_redemption_final_approval: record.source_redemption_final_approval_hash || parentFinalNonExecutionEvidenceSeal.source_redemption_final_approval_hash,
      token_material: record.source_token_material_hash || parentFinalNonExecutionEvidenceSeal.source_token_material_hash,
      redemption_package_freeze: record.source_redemption_package_freeze_hash || parentFinalNonExecutionEvidenceSeal.source_redemption_package_freeze_hash
    };

    const evidencePayload = {
      act_token_redempt_unlock_governance_readiness_closure_id: unlockGovernanceReadinessClosureId,
      schema_version: '180.0',
      parent_final_non_execution_evidence_seal_id: record.source_act_token_redempt_unlock_final_non_execution_evidence_seal_id,
      governance_closure_officer_id_sha256: hashId(record.governance_closure_officer_id),
      governance_closure_officer_role: record.governance_closure_officer_role,
      primary_authorizer_id_sha256: hashId(record.primary_authorizer_id),
      secondary_authorizer_id_sha256: hashId(record.secondary_authorizer_id),
      final_human_authorizer_id_sha256: hashId(record.final_human_authorizer_id),
      compliance_witness_id_sha256: hashId(record.compliance_witness_id),
      risk_officer_id_sha256: hashId(record.risk_officer_id),
      legal_policy_officer_id_sha256: hashId(record.legal_policy_officer_id),
      rollback_officer_id_sha256: hashId(record.rollback_officer_id),
      kill_switch_verification_officer_id_sha256: hashId(record.kill_switch_verification_officer_id),
      evidence_seal_officer_id_sha256: hashId(record.evidence_seal_officer_id),
      rules_evaluated: record.governance_readiness_closure_rules_json || [],
      lineageHashChain,
      timestamp: new Date()
    };

    const evidencePackHash = crypto.createHash('sha256').update(JSON.stringify(evidencePayload)).digest('hex');

    return {
      evidence_pack_hash: evidencePackHash,
      evidence_pack_json: evidencePayload
    };
  }

  async getEvidence(id) {
    if (!isProdLike) {
      return this._mockState.evidence.get(id) || null;
    }
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_grc_ev
       WHERE act_token_redempt_unlock_governance_readiness_closure_id = ?`,
      [id]
    );
    return rows.length ? rows[0] : null;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureEvidencePackService()
};
