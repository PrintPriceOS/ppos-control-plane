'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const operatorAttestationBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationBuilderService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationEvidencePackService {
  constructor() {
    this._mockEvidence = new Map();
  }

  async generateEvidencePack(record, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // Retrieve parent lineage
    let parentLineage = {};
    if (!isProdLike) {
      const parent = operatorAttestationBuilder._mockState.tokenRedemptionUnlockOperatorAttestation.get(record.source_act_token_redempt_unlock_operator_attestation_id);
      if (parent) {
        parentLineage = parent.lineage_hash_chain_json || {};
      }
    } else {
      const rows = await db.query(
        `SELECT lineage_hash_chain_json FROM cb_cohort_intervention_activation_token_redempt_unlock_oatt_ev WHERE activation_token_redemption_unlock_operator_attestation_id = ?`,
        [record.source_act_token_redempt_unlock_operator_attestation_id]
      );
      if (rows && rows[0]) {
        try {
          parentLineage = typeof rows[0].lineage_hash_chain_json === 'string' ? JSON.parse(rows[0].lineage_hash_chain_json) : (rows[0].lineage_hash_chain_json || {});
        } catch (e) {
          parentLineage = {};
        }
      }
    }

    const lineageHashChain = {
      phase172_unlock_dual_control_authorization:
        record.unlock_dual_control_authorization_hash ||
        record.unlock_dual_control_authorization_evidence_pack_hash ||
        record.evidence_pack_hash ||
        'pending_hash',

      phase171_unlock_operator_attestation:
        record.source_unlock_operator_attestation_hash ||
        (parentLineage && (parentLineage.phase171_unlock_operator_attestation || parentLineage.unlock_operator_attestation_hash)) ||
        'mock_attestation_hash',

      phase170_unlock_pre_execution_freeze:
        record.source_unlock_pre_execution_freeze_hash ||
        (parentLineage && parentLineage.phase170_unlock_pre_execution_freeze) ||
        'mock_freeze_hash',

      phase169_unlock_readiness_seal:
        record.source_unlock_seal_hash ||
        (parentLineage && parentLineage.phase169_unlock_readiness_seal) ||
        'mock_seal_hash',

      phase168_unlock_final_review:
        record.source_unlock_final_review_hash ||
        (parentLineage && parentLineage.phase168_unlock_final_review) ||
        'mock_final_review_hash',

      phase167_unlock_approval:
        record.source_unlock_approval_hash ||
        (parentLineage && parentLineage.phase167_unlock_approval) ||
        'mock_approval_hash',

      phase166_unlock_eligibility:
        record.source_unlock_eligibility_hash ||
        (parentLineage && parentLineage.phase166_unlock_eligibility) ||
        'mock_eligibility_hash',

      phase165_redemption_lock:
        record.source_redemption_lock_hash ||
        (parentLineage && parentLineage.phase165_redemption_lock) ||
        'mock_lock_hash',

      phase164_redemption_final_approval:
        record.source_redemption_final_approval_hash ||
        (parentLineage && parentLineage.phase164_redemption_final_approval) ||
        'mock_final_approval_hash',

      token_material:
        record.source_token_material_hash ||
        (parentLineage && parentLineage.token_material) ||
        'mock_token_material_hash',

      redemption_package_freeze:
        record.source_redemption_package_freeze_hash ||
        (parentLineage && parentLineage.redemption_package_freeze) ||
        'mock_freeze_hash'
    };

    // Redacted authorizer identities for privacy and compliance (evidence package requirements)
    const redactedPrimaryId = record.primary_authorizer_id ? crypto.createHash('sha256').update(record.primary_authorizer_id).digest('hex').substring(0, 16) : null;
    const redactedSecondaryId = record.secondary_authorizer_id ? crypto.createHash('sha256').update(record.secondary_authorizer_id).digest('hex').substring(0, 16) : null;

    const payload = {
      evidence_schema_version: '172.0',
      activation_token_redemption_unlock_dual_control_authorization_id: record.activation_token_redemption_unlock_dual_control_authorization_id,
      source_act_token_redempt_unlock_operator_attestation_id: record.source_act_token_redempt_unlock_operator_attestation_id,
      simulation_type: record.simulation_type,
      tenant_id: record.tenant_id,
      cohort_id: record.cohort_id,
      risk_level: record.risk_level,
      confidence_level: record.confidence_level,
      projected_impact_score: record.projected_impact_score,
      rollback_feasibility_score: record.rollback_feasibility_score,
      evidence_completeness_score: record.evidence_completeness_score,
      guardrail_status: record.guardrail_status,
      write_scope_status: record.write_scope_status,
      unlock_dual_control_authorization_status: record.unlock_dual_control_authorization_status,
      unlock_dual_control_authorization_result: record.unlock_dual_control_authorization_result,
      primary_authorizer_id_sha256: redactedPrimaryId,
      primary_authorizer_role: record.primary_authorizer_role,
      secondary_authorizer_id_sha256: redactedSecondaryId,
      secondary_authorizer_role: record.secondary_authorizer_role,
      lineageHashChain
    };

    const evidencePackHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const evidenceId = `ev_${crypto.randomBytes(8).toString('hex')}`;

    if (!isProdLike) {
      const epRecord = {
        evidence_id: evidenceId,
        activation_token_redemption_unlock_dual_control_authorization_id: record.activation_token_redemption_unlock_dual_control_authorization_id,
        evidence_schema_version: '172.0',
        evidence_pack_hash: evidencePackHash,
        evidence_payload_json: JSON.stringify(payload),
        lineage_hash_chain_json: JSON.stringify(lineageHashChain),
        created_at: new Date()
      };
      this._mockEvidence.set(record.activation_token_redemption_unlock_dual_control_authorization_id, epRecord);
      return {
        evidence_pack_hash: evidencePackHash,
        lineageHashChain,
        evidence_payload_json: epRecord.evidence_payload_json,
        lineage_hash_chain_json: epRecord.lineage_hash_chain_json
      };
    }

    await db.query(
      `DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_dcau_ev WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?`,
      [record.activation_token_redemption_unlock_dual_control_authorization_id]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_dcau_ev
       (evidence_id, activation_token_redemption_unlock_dual_control_authorization_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [evidenceId, record.activation_token_redemption_unlock_dual_control_authorization_id, '172.0', evidencePackHash, JSON.stringify(payload), JSON.stringify(lineageHashChain)]
    );

    return {
      evidence_pack_hash: evidencePackHash,
      lineageHashChain,
      evidence_payload_json: JSON.stringify(payload),
      lineage_hash_chain_json: JSON.stringify(lineageHashChain)
    };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationEvidencePackService()
};
