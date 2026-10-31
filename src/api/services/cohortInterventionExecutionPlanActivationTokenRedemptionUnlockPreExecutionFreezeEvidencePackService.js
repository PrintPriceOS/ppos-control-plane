'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const sealBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealBuilderService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeEvidencePackService {
  constructor() {
    this._mockEvidence = new Map();
  }

  async generateEvidencePack(record, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // Retrieve parent lineage
    let parentLineage = {};
    if (!isProdLike) {
      const parent = sealBuilder._mockState.tokenRedemptionUnlockSeal.get(record.source_activation_token_redemption_unlock_seal_id);
      if (parent) {
        parentLineage = parent.lineage_hash_chain_json || {};
      }
    } else {
      const rows = await db.query(
        `SELECT lineage_hash_chain_json FROM cb_cohort_intervention_activation_token_redempt_unlock_seal_ev WHERE activation_token_redemption_unlock_seal_id = ?`,
        [record.source_activation_token_redemption_unlock_seal_id]
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
      phase170_unlock_pre_execution_freeze:
        record.unlock_pre_execution_freeze_hash ||
        record.unlock_pre_execution_freeze_evidence_pack_hash ||
        record.evidence_pack_hash ||
        'pending_hash',

      phase169_unlock_readiness_seal:
        record.source_unlock_seal_hash ||
        (parentLineage && (parentLineage.phase169_unlock_readiness_seal || parentLineage.unlock_seal_hash)) ||
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

    const payload = {
      evidence_schema_version: '170.0',
      activation_token_redemption_unlock_pre_execution_freeze_id: record.activation_token_redemption_unlock_pre_execution_freeze_id,
      source_activation_token_redemption_unlock_seal_id: record.source_activation_token_redemption_unlock_seal_id,
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
      unlock_pre_execution_freeze_status: record.unlock_pre_execution_freeze_status,
      unlock_pre_execution_freeze_result: record.unlock_pre_execution_freeze_result,
      lineageHashChain
    };

    const evidencePackHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const evidenceId = `ev_${crypto.randomBytes(8).toString('hex')}`;

    if (!isProdLike) {
      const epRecord = {
        evidence_id: evidenceId,
        activation_token_redemption_unlock_pre_execution_freeze_id: record.activation_token_redemption_unlock_pre_execution_freeze_id,
        evidence_schema_version: '170.0',
        evidence_pack_hash: evidencePackHash,
        evidence_payload_json: JSON.stringify(payload),
        lineage_hash_chain_json: JSON.stringify(lineageHashChain),
        created_at: new Date()
      };
      this._mockEvidence.set(record.activation_token_redemption_unlock_pre_execution_freeze_id, epRecord);
      return { evidence_pack_hash: evidencePackHash, lineageHashChain };
    }

    await db.query(
      `DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_pfrz_ev WHERE activation_token_redemption_unlock_pre_execution_freeze_id = ?`,
      [record.activation_token_redemption_unlock_pre_execution_freeze_id]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_pfrz_ev
       (evidence_id, activation_token_redemption_unlock_pre_execution_freeze_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [evidenceId, record.activation_token_redemption_unlock_pre_execution_freeze_id, '170.0', evidencePackHash, JSON.stringify(payload), JSON.stringify(lineageHashChain)]
    );

    return { evidence_pack_hash: evidencePackHash, lineageHashChain };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeEvidencePackService()
};
