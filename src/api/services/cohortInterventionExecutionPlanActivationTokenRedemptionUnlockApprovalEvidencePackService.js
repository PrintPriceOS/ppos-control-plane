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
        `SELECT lineage_hash_chain_json FROM cb_cohort_intervention_activation_token_redempt_unlock_elig WHERE activation_token_redemption_unlock_eligibility_id = ?`,
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
      phase167_unlock_approval: {
        activation_token_redemption_unlock_approval_id: record.activation_token_redemption_unlock_approval_id,
        unlock_approval_status: record.unlock_approval_status,
        unlock_approval_result: record.unlock_approval_result,
        unlock_approval_hash: record.unlock_approval_hash,
        timestamp: new Date()
      },
      phase166_unlock_eligibility: parentLineage.phase166_unlock_eligibility || null,
      phase165_token_redemption_lock: parentLineage.phase165_token_redemption_lock || null,
      phase164_token_redemption_final_approval: parentLineage.phase164_token_redemption_final_approval || null,
      phase163_token_redemption_envelope: parentLineage.phase163_token_redemption_envelope || null,
      phase162_token_redemption_authorization: parentLineage.phase162_token_redemption_authorization || null
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
