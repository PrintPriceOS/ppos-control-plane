'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const eligBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalEvidencePackService {
  constructor() {
    this._mockEvidence = new Map();
  }

  async generateEvidencePack(record, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // Retrieve parent lineage
    let parentLineage = {};
    if (!isProdLike) {
      const parent = eligBuilder._mockState.tokenRedemptionUnlockEligibility.get(record.source_activation_token_redemption_unlock_eligibility_id);
      if (parent) {
        parentLineage = parent.lineage_hash_chain_json || {};
      }
    } else {
      const rows = await db.query(
        `SELECT lineage_hash_chain_json FROM cb_cohort_intervention_activation_token_redempt_unlock_elig_ev WHERE activation_token_redemption_unlock_eligibility_id = ?`,
        [record.source_activation_token_redemption_unlock_eligibility_id]
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
      phase166_unlock_eligibility:
        record.source_unlock_eligibility_hash ||
        record.source_activation_token_redemption_unlock_eligibility_hash ||
        (parentLineage && (parentLineage.phase166_unlock_eligibility || parentLineage.unlock_eligibility_hash)) ||
        'mock_eligibility_hash',

      phase165_redemption_lock:
        record.source_redemption_lock_hash ||
        (parentLineage && (parentLineage.phase165_redemption_lock || parentLineage.phase165_token_redemption_lock)) ||
        'mock_lock_hash',

      phase164_redemption_final_approval:
        record.source_redemption_final_approval_hash ||
        (parentLineage && (parentLineage.phase164_redemption_final_approval || parentLineage.phase164_token_redemption_final_approval)) ||
        'mock_final_approval_hash',

      token_material:
        record.source_token_material_hash ||
        (parentLineage && parentLineage.token_material) ||
        'mock_token_material_hash',

      redemption_package_freeze:
        record.source_redemption_package_freeze_hash ||
        (parentLineage && parentLineage.redemption_package_freeze) ||
        'mock_freeze_hash',

      phase167_unlock_approval:
        record.unlock_approval_hash ||
        record.unlock_approval_evidence_pack_hash ||
        record.evidence_pack_hash ||
        'pending_hash'
    };

    const payload = {
      evidence_schema_version: '167.0',
      activation_token_redemption_unlock_approval_id: record.activation_token_redemption_unlock_approval_id,
      source_activation_token_redemption_unlock_eligibility_id: record.source_activation_token_redemption_unlock_eligibility_id,
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
      unlock_approval_status: record.unlock_approval_status,
      unlock_approval_result: record.unlock_approval_result,
      lineageHashChain
    };

    const evidencePackHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const evidenceId = `ev_${crypto.randomBytes(8).toString('hex')}`;

    if (!isProdLike) {
      const epRecord = {
        evidence_id: evidenceId,
        activation_token_redemption_unlock_approval_id: record.activation_token_redemption_unlock_approval_id,
        evidence_schema_version: '167.0',
        evidence_pack_hash: evidencePackHash,
        evidence_payload_json: JSON.stringify(payload),
        lineage_hash_chain_json: JSON.stringify(lineageHashChain),
        created_at: new Date()
      };
      this._mockEvidence.set(record.activation_token_redemption_unlock_approval_id, epRecord);
      return { evidence_pack_hash: evidencePackHash, lineageHashChain };
    }

    await db.query(
      `DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_apv_ev WHERE activation_token_redemption_unlock_approval_id = ?`,
      [record.activation_token_redemption_unlock_approval_id]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_apv_ev
       (evidence_id, activation_token_redemption_unlock_approval_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [evidenceId, record.activation_token_redemption_unlock_approval_id, '167.0', evidencePackHash, JSON.stringify(payload), JSON.stringify(lineageHashChain)]
    );

    return { evidence_pack_hash: evidencePackHash, lineageHashChain };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalEvidencePackService()
};
