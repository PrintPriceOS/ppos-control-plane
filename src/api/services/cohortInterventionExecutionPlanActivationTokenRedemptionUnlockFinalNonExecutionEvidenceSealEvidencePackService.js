'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealBuilderService').serviceInstance;
const parentBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunBuilderService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealEvidencePackService {
  constructor() {
    this._mockState = {
      evidence: new Map()
    };
  }

  async generateEvidencePack(unlockFinalNonExecutionEvidenceSealId, actorId) {
    const record = await builder.getTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId);
    if (!record) {
      throw new Error(`Record ${unlockFinalNonExecutionEvidenceSealId} not found.`);
    }

    const parentKillSwitchDryRun = await parentBuilder.getTokenRedemptionUnlockKillSwitchDryRun(record.source_act_token_redempt_unlock_kill_switch_dry_run_id);
    if (!parentKillSwitchDryRun) {
      throw new Error(`Parent kill switch dry run not found.`);
    }

    const hashId = (id) => id ? crypto.createHash('sha256').update(id).digest('hex') : null;

    const lineageHashChain = {
      phase179_unlock_final_non_execution_evidence_seal: record.unlock_final_non_execution_evidence_seal_hash || record.unlock_final_non_execution_evidence_seal_evidence_pack_hash || 'fnees_hash_dummy',
      phase178_unlock_kill_switch_dry_run: record.source_unlock_kill_switch_dry_run_hash || parentKillSwitchDryRun.unlock_kill_switch_dry_run_hash || parentKillSwitchDryRun.evidence_pack_hash,
      phase177_unlock_emergency_rollback_authority: record.source_unlock_emergency_rollback_authority_hash || parentKillSwitchDryRun.source_unlock_emergency_rollback_authority_hash,
      phase176_unlock_legal_policy_hold: record.source_unlock_legal_policy_hold_hash || parentKillSwitchDryRun.source_unlock_legal_policy_hold_hash,
      phase175_unlock_risk_officer_countersign: record.source_unlock_risk_officer_countersign_hash || parentKillSwitchDryRun.source_unlock_risk_officer_countersign_hash,
      phase174_unlock_compliance_witness: record.source_unlock_compliance_witness_hash || parentKillSwitchDryRun.source_unlock_compliance_witness_hash,
      phase173_unlock_final_human_authorization_seal: record.source_unlock_final_human_authorization_seal_hash || parentKillSwitchDryRun.source_unlock_final_human_authorization_seal_hash,
      phase172_unlock_dual_control_authorization: record.source_unlock_dual_control_authorization_hash || parentKillSwitchDryRun.source_unlock_dual_control_authorization_hash,
      phase171_unlock_operator_attestation: record.source_unlock_operator_attestation_hash || parentKillSwitchDryRun.source_unlock_operator_attestation_hash,
      phase170_unlock_pre_execution_freeze: record.source_unlock_pre_execution_freeze_hash || parentKillSwitchDryRun.source_unlock_pre_execution_freeze_hash,
      phase169_unlock_readiness_seal: record.source_unlock_seal_hash || parentKillSwitchDryRun.source_unlock_seal_hash,
      phase168_unlock_final_review: record.source_unlock_final_review_hash || parentKillSwitchDryRun.source_unlock_final_review_hash,
      phase167_unlock_approval: record.source_unlock_approval_hash || parentKillSwitchDryRun.source_unlock_approval_hash,
      phase166_unlock_eligibility: record.source_unlock_eligibility_hash || parentKillSwitchDryRun.source_unlock_eligibility_hash,
      phase165_redemption_lock: record.source_redemption_lock_hash || parentKillSwitchDryRun.source_redemption_lock_hash,
      phase164_redemption_final_approval: record.source_redemption_final_approval_hash || parentKillSwitchDryRun.source_redemption_final_approval_hash,
      token_material: record.source_token_material_hash || parentKillSwitchDryRun.source_token_material_hash,
      redemption_package_freeze: record.source_redemption_package_freeze_hash || parentKillSwitchDryRun.source_redemption_package_freeze_hash
    };

    const evidencePayload = {
      act_token_redempt_unlock_final_non_execution_evidence_seal_id: unlockFinalNonExecutionEvidenceSealId,
      schema_version: '179.0',
      parent_kill_switch_dry_run_id: record.source_act_token_redempt_unlock_kill_switch_dry_run_id,
      evidence_seal_officer_id_sha256: hashId(record.evidence_seal_officer_id),
      evidence_seal_officer_role: record.evidence_seal_officer_role,
      primary_authorizer_id_sha256: hashId(record.primary_authorizer_id),
      secondary_authorizer_id_sha256: hashId(record.secondary_authorizer_id),
      final_human_authorizer_id_sha256: hashId(record.final_human_authorizer_id),
      compliance_witness_id_sha256: hashId(record.compliance_witness_id),
      risk_officer_id_sha256: hashId(record.risk_officer_id),
      legal_policy_officer_id_sha256: hashId(record.legal_policy_officer_id),
      rollback_officer_id_sha256: hashId(record.rollback_officer_id),
      kill_switch_verification_officer_id_sha256: hashId(record.kill_switch_verification_officer_id),
      rules_evaluated: record.final_non_execution_evidence_rules_json || [],
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
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_fnees_ev
       WHERE act_token_redempt_unlock_final_non_execution_evidence_seal_id = ?`,
      [id]
    );
    return rows.length ? rows[0] : null;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealEvidencePackService()
};
