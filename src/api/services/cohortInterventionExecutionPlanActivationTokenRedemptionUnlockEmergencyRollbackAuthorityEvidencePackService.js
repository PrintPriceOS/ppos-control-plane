'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityBuilderService').serviceInstance;
const parentBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldBuilderService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityEvidencePackService {
  constructor() {
    this._mockEvidence = new Map();
  }

  async generateAndPersistEvidencePack(unlockEmergencyRollbackAuthorityId, actorId) {
    const record = await builder.getTokenRedemptionUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId);
    if (!record) {
      throw new Error(`Record ${unlockEmergencyRollbackAuthorityId} not found.`);
    }

    const parentLegalPolicyHold = await parentBuilder.getTokenRedemptionUnlockLegalPolicyHold(record.source_act_token_redempt_unlock_legal_policy_hold_id);
    if (!parentLegalPolicyHold) {
      throw new Error(`Parent legal policy hold not found.`);
    }

    // Redaction hash helper
    const hashId = (id) => id ? crypto.createHash('sha256').update(id).digest('hex') : null;

    const lineageHashChain = {
      phase177_unlock_emergency_rollback_authority: record.unlock_emergency_rollback_authority_hash || 'era_hash_dummy',
      phase176_unlock_legal_policy_hold: record.source_unlock_legal_policy_hold_hash || parentLegalPolicyHold.unlock_legal_policy_hold_hash || parentLegalPolicyHold.evidence_pack_hash,
      phase175_unlock_risk_officer_countersign: record.source_unlock_risk_officer_countersign_hash || parentLegalPolicyHold.source_unlock_risk_officer_countersign_hash,
      phase174_unlock_compliance_witness: record.source_unlock_compliance_witness_hash || parentLegalPolicyHold.source_unlock_compliance_witness_hash,
      phase173_unlock_final_human_authorization_seal: record.source_unlock_final_human_authorization_seal_hash || parentLegalPolicyHold.source_unlock_final_human_authorization_seal_hash,
      phase172_unlock_dual_control_authorization: record.source_unlock_dual_control_authorization_hash || parentLegalPolicyHold.source_unlock_dual_control_authorization_hash,
      phase171_unlock_operator_attestation: record.source_unlock_operator_attestation_hash || parentLegalPolicyHold.source_unlock_operator_attestation_hash,
      phase170_unlock_pre_execution_freeze: record.source_unlock_pre_execution_freeze_hash || parentLegalPolicyHold.source_unlock_pre_execution_freeze_hash,
      phase169_unlock_readiness_seal: record.source_unlock_seal_hash || parentLegalPolicyHold.source_unlock_seal_hash,
      phase168_unlock_final_review: record.source_unlock_final_review_hash || parentLegalPolicyHold.source_unlock_final_review_hash,
      phase167_unlock_approval: record.source_unlock_approval_hash || parentLegalPolicyHold.source_unlock_approval_hash,
      phase166_unlock_eligibility: record.source_unlock_eligibility_hash || parentLegalPolicyHold.source_unlock_eligibility_hash,
      phase165_redemption_lock: record.source_redemption_lock_hash || parentLegalPolicyHold.source_redemption_lock_hash,
      phase164_redemption_final_approval: record.source_redemption_final_approval_hash || parentLegalPolicyHold.source_redemption_final_approval_hash,
      token_material: record.source_token_material_hash || parentLegalPolicyHold.source_token_material_hash,
      redemption_package_freeze: record.source_redemption_package_freeze_hash || parentLegalPolicyHold.source_redemption_package_freeze_hash
    };

    const evidencePayload = {
      act_token_redempt_unlock_emergency_rollback_authority_id: unlockEmergencyRollbackAuthorityId,
      schema_version: '177.0',
      parent_legal_policy_hold_id: record.source_act_token_redempt_unlock_legal_policy_hold_id,
      rollback_officer_id_sha256: hashId(record.rollback_officer_id),
      rollback_officer_role: record.rollback_officer_role,
      primary_authorizer_id_sha256: hashId(record.primary_authorizer_id),
      secondary_authorizer_id_sha256: hashId(record.secondary_authorizer_id),
      final_human_authorizer_id_sha256: hashId(record.final_human_authorizer_id),
      compliance_witness_id_sha256: hashId(record.compliance_witness_id),
      risk_officer_id_sha256: hashId(record.risk_officer_id),
      legal_policy_officer_id_sha256: hashId(record.legal_policy_officer_id),
      safety_snapshot: record.safety_snapshot_json || {},
      rules_evaluated: record.unlock_emergency_rollback_authority_rules_json || [],
      lineageHashChain,
      timestamp: new Date()
    };

    const evidencePayloadStr = JSON.stringify(evidencePayload);
    const evidencePackHash = crypto.createHash('sha256').update(evidencePayloadStr).digest('hex');

    const evidencePackId = 'era_ev_' + crypto.randomBytes(8).toString('hex');

    const evidenceRecord = {
      evidence_pack_id: evidencePackId,
      act_token_redempt_unlock_emergency_rollback_authority_id: unlockEmergencyRollbackAuthorityId,
      schema_version: '177.0',
      evidence_payload_json: evidencePayloadStr,
      evidence_pack_hash: evidencePackHash,
      generated_at: new Date(),
      created_by: actorId,
      updated_by: actorId
    };

    if (!isProdLike) {
      this._mockEvidence.set(unlockEmergencyRollbackAuthorityId, evidenceRecord);
    } else {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_era_ev WHERE act_token_redempt_unlock_emergency_rollback_authority_id = ?`, [unlockEmergencyRollbackAuthorityId]);
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_era_ev
         (evidence_pack_id, act_token_redempt_unlock_emergency_rollback_authority_id, schema_version, evidence_payload_json, evidence_pack_hash, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [evidenceRecord.evidence_pack_id, evidenceRecord.act_token_redempt_unlock_emergency_rollback_authority_id, evidenceRecord.schema_version, evidenceRecord.evidence_payload_json, evidenceRecord.evidence_pack_hash, actorId, actorId]
      );
    }

    return {
      evidence_pack_hash: evidencePackHash,
      evidence_payload: evidencePayload
    };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityEvidencePackService()
};
