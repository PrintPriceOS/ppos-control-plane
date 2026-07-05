'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

class CohortInterventionExecutionPlanActivationTokenPreflightEvidencePackService {
  async generateEvidencePack(tokenPreflightRecord, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Trace lineage chain from Phase 158
    let parentEvidenceHash = 'none';
    let lineageHashChain = {
      phase137: 'none', phase138: 'none', phase139: 'none', phase140: 'none',
      phase141: 'none', phase142: 'none', phase143: 'none', phase144: 'none',
      phase145: 'none', phase146: 'none', phase147: 'none', phase148: 'none',
      phase149: 'none', phase150: 'none', phase151: 'none', phase152: 'none',
      phase153: 'none', phase154: 'none', phase155: 'none', phase156: 'none',
      phase157: 'none', phase158: 'none'
    };

    if (isProdLike) {
      const parentStagingEvidence = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_staging_evidence 
         WHERE activation_token_staging_id = ? ORDER BY created_at DESC LIMIT 1`,
        [tokenPreflightRecord.source_activation_token_staging_id]
      );
      if (parentStagingEvidence && parentStagingEvidence[0]) {
        parentEvidenceHash = parentStagingEvidence[0].evidence_pack_hash;
        const parentChain = typeof parentStagingEvidence[0].lineage_hash_chain_json === 'string'
          ? JSON.parse(parentStagingEvidence[0].lineage_hash_chain_json)
          : parentStagingEvidence[0].lineage_hash_chain_json;
        lineageHashChain = { ...parentChain, phase158: parentEvidenceHash };
      }
    } else {
      parentEvidenceHash = 'stg_mock_hash_159';
      lineageHashChain.phase158 = parentEvidenceHash;
      lineageHashChain.phase157 = 'apv_mock_hash_159';
    }

    const currentChain = { ...lineageHashChain, phase159_token_preflight: tokenPreflightRecord.activation_token_preflight_hash };

    // 2. Build payload with redaction
    const evidencePayload = {
      evidence_schema_version: '159.0',
      activation_token_preflight_id: tokenPreflightRecord.activation_token_preflight_id,
      parent_staging_id: tokenPreflightRecord.source_activation_token_staging_id,
      risk_level: tokenPreflightRecord.risk_level,
      confidence_level: tokenPreflightRecord.confidence_level,
      projected_impact_score: tokenPreflightRecord.projected_impact_score,
      rollback_feasibility_score: tokenPreflightRecord.rollback_feasibility_score,
      evidence_completeness_score: tokenPreflightRecord.evidence_completeness_score,
      non_execution_attestation: tokenPreflightRecord.non_execution_attestation_json,
      write_scope_attestation: tokenPreflightRecord.write_scope_attestation_json,
      preflight_metadata: tokenPreflightRecord.preflight_metadata_json,
      preflight_by: actorId,
      preflight_at: new Date(),
      redacted_system_token_material: '[REDACTED_SECURE_TOKEN_MATERIAL_PREFLIGHT_ONLY]'
    };

    const evidenceId = 'ev_pfl_' + crypto.randomBytes(8).toString('hex');
    const evidencePackHash = 'ep_pfl_' + crypto.createHash('sha256')
      .update(JSON.stringify(evidencePayload) + '-' + parentEvidenceHash)
      .digest('hex');

    if (isProdLike) {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_preflight_evidence 
         (evidence_id, activation_token_preflight_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json) 
         VALUES (?, ?, '159.0', ?, ?, ?)`,
        [evidenceId, tokenPreflightRecord.activation_token_preflight_id, evidencePackHash,
          JSON.stringify(evidencePayload), JSON.stringify(currentChain)]
      );
    }

    return { evidenceId, evidencePackHash, lineageHashChain: currentChain };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenPreflightEvidencePackService()
};
