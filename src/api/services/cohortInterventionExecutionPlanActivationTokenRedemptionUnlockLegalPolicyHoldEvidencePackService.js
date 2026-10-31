'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldBuilderService').serviceInstance;
const parentBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignBuilderService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldEvidencePackService {
  constructor() {
    this._mockEvidence = new Map();
  }

  async generateEvidencePack(unlockLegalPolicyHoldId, actorId) {
    const record = await builder.getTokenRedemptionUnlockLegalPolicyHold(unlockLegalPolicyHoldId);
    if (!record) {
      throw new Error(`Record ${unlockLegalPolicyHoldId} not found.`);
    }

    const parentRiskCountersign = await parentBuilder.getTokenRedemptionUnlockRiskOfficerCountersign(record.source_act_token_redempt_unlock_risk_officer_countersign_id);
    if (!parentRiskCountersign) {
      throw new Error(`Parent risk officer countersign not found.`);
    }

    // Redaction hashes
    const hashId = (id) => id ? crypto.createHash('sha256').update(id).digest('hex') : null;

    const evidencePayload = {
      act_token_redempt_unlock_legal_policy_hold_id: unlockLegalPolicyHoldId,
      schema_version: '176.0',
      parent_risk_officer_countersign_id: record.source_act_token_redempt_unlock_risk_officer_countersign_id,
      legal_policy_officer_id_sha256: hashId(record.legal_policy_officer_id),
      legal_policy_officer_role: record.legal_policy_officer_role,
      primary_authorizer_id_sha256: hashId(record.primary_authorizer_id),
      secondary_authorizer_id_sha256: hashId(record.secondary_authorizer_id),
      final_human_authorizer_id_sha256: hashId(record.final_human_authorizer_id),
      compliance_witness_id_sha256: hashId(record.compliance_witness_id),
      risk_officer_id_sha256: hashId(record.risk_officer_id),
      safety_snapshot: record.safety_snapshot_json || {},
      rules_evaluated: record.unlock_legal_policy_hold_rules_json || [],
      timestamp: new Date()
    };

    const evidencePayloadStr = JSON.stringify(evidencePayload);
    const evidencePackHash = crypto.createHash('sha256').update(evidencePayloadStr).digest('hex');

    const lineageHashChain = {
      phase176_unlock_legal_policy_hold: record.unlock_legal_policy_hold_hash || evidencePackHash,
      phase175_unlock_risk_officer_countersign: record.source_unlock_risk_officer_countersign_hash || parentRiskCountersign.unlock_risk_officer_countersign_hash || parentRiskCountersign.evidence_pack_hash,
      phase174_unlock_compliance_witness: record.source_unlock_compliance_witness_hash || parentRiskCountersign.source_unlock_compliance_witness_hash,
      phase173_unlock_final_human_authorization_seal: record.source_unlock_final_human_authorization_seal_hash || parentRiskCountersign.source_unlock_final_human_authorization_seal_hash,
      phase172_unlock_dual_control_authorization: record.source_unlock_dual_control_authorization_hash || parentRiskCountersign.source_unlock_dual_control_authorization_hash,
      phase171_unlock_operator_attestation: record.source_unlock_operator_attestation_hash || parentRiskCountersign.source_unlock_operator_attestation_hash,
      phase170_unlock_pre_execution_freeze: record.source_unlock_pre_execution_freeze_hash || parentRiskCountersign.source_unlock_pre_execution_freeze_hash,
      phase169_unlock_readiness_seal: record.source_unlock_seal_hash || parentRiskCountersign.source_unlock_seal_hash,
      phase168_unlock_final_review: record.source_unlock_final_review_hash || parentRiskCountersign.source_unlock_final_review_hash,
      phase167_unlock_approval: record.source_unlock_approval_hash || parentRiskCountersign.source_unlock_approval_hash,
      phase166_unlock_eligibility: record.source_unlock_eligibility_hash || parentRiskCountersign.source_unlock_eligibility_hash,
      phase165_redemption_lock: record.source_redemption_lock_hash || parentRiskCountersign.source_redemption_lock_hash,
      phase164_redemption_final_approval: record.source_redemption_final_approval_hash || parentRiskCountersign.source_redemption_final_approval_hash,
      token_material: record.source_token_material_hash || parentRiskCountersign.source_token_material_hash,
      redemption_package_freeze: record.source_redemption_package_freeze_hash || parentRiskCountersign.source_redemption_package_freeze_hash
    };

    const evidencePackId = 'lph_ev_' + crypto.randomBytes(8).toString('hex');

    const evidenceRecord = {
      evidence_pack_id: evidencePackId,
      act_token_redempt_unlock_legal_policy_hold_id: unlockLegalPolicyHoldId,
      schema_version: '176.0',
      evidence_payload_json: evidencePayloadStr,
      evidence_pack_hash: evidencePackHash,
      generated_at: new Date(),
      created_by: actorId,
      updated_by: actorId
    };

    if (!isProdLike) {
      this._mockEvidence.set(unlockLegalPolicyHoldId, evidenceRecord);
    } else {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_lph_ev WHERE act_token_redempt_unlock_legal_policy_hold_id = ?`, [unlockLegalPolicyHoldId]);
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_lph_ev
         (evidence_pack_id, act_token_redempt_unlock_legal_policy_hold_id, schema_version, evidence_payload_json, evidence_pack_hash, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [evidenceRecord.evidence_pack_id, evidenceRecord.act_token_redempt_unlock_legal_policy_hold_id, evidenceRecord.schema_version, evidenceRecord.evidence_payload_json, evidenceRecord.evidence_pack_hash, actorId, actorId]
      );
    }

    return {
      evidencePack: evidenceRecord,
      evidencePackHash,
      lineageHashChain
    };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldEvidencePackService()
};
