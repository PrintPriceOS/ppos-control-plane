'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

class CohortInterventionExecutionPlanActivationTokenStagingEvidencePackService {
  async generateEvidencePack(tokenStagingRecord, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Trace lineage chain back from Phase 157
    let parentEvidenceHash = 'none';
    let lineageHashChain = {
      phase137: 'none',
      phase138: 'none',
      phase139: 'none',
      phase140: 'none',
      phase141: 'none',
      phase142: 'none',
      phase143: 'none',
      phase144: 'none',
      phase145: 'none',
      phase146: 'none',
      phase147: 'none',
      phase148: 'none',
      phase149: 'none',
      phase150: 'none',
      phase151: 'none',
      phase152: 'none',
      phase153: 'none',
      phase154: 'none',
      phase155: 'none',
      phase156: 'none',
      phase157: 'none'
    };

    if (isProdLike) {
      const parentApvEvidence = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_final_apv_evidence 
         WHERE activation_token_final_apv_id = ? ORDER BY created_at DESC LIMIT 1`,
        [tokenStagingRecord.source_activation_token_final_apv_id]
      );
      if (parentApvEvidence && parentApvEvidence[0]) {
        parentEvidenceHash = parentApvEvidence[0].evidence_pack_hash;
        const parentChain = typeof parentApvEvidence[0].lineage_hash_chain_json === 'string'
          ? JSON.parse(parentApvEvidence[0].lineage_hash_chain_json)
          : parentApvEvidence[0].lineage_hash_chain_json;
        lineageHashChain = { ...parentChain, phase157: parentEvidenceHash };
      }
    } else {
      // Mock mode fallback tracing simulation
      parentEvidenceHash = 'apv_mock_hash_158';
      lineageHashChain.phase157 = parentEvidenceHash;
    }

    const currentChain = { ...lineageHashChain, phase158_token_staging: tokenStagingRecord.activation_token_staging_hash };

    // 2. Build payload with strict redactions
    const evidencePayload = {
      evidence_schema_version: '158.0',
      activation_token_staging_id: tokenStagingRecord.activation_token_staging_id,
      parent_final_approval_id: tokenStagingRecord.source_activation_token_final_apv_id,
      risk_level: tokenStagingRecord.risk_level,
      confidence_level: tokenStagingRecord.confidence_level,
      projected_impact_score: tokenStagingRecord.projected_impact_score,
      rollback_feasibility_score: tokenStagingRecord.rollback_feasibility_score,
      evidence_completeness_score: tokenStagingRecord.evidence_completeness_score,
      non_execution_attestation: tokenStagingRecord.non_execution_attestation_json,
      write_scope_attestation: tokenStagingRecord.write_scope_attestation_json,
      staging_metadata: tokenStagingRecord.staging_metadata_json,
      staged_by: actorId,
      staged_at: new Date(),
      redacted_system_token_material: '[REDACTED_SECURE_TOKEN_MATERIAL_STAGED_ONLY]'
    };

    const evidenceId = 'ev_stg_' + crypto.randomBytes(8).toString('hex');
    const evidencePackHash = 'ep_stg_' + crypto.createHash('sha256').update(JSON.stringify(evidencePayload) + '-' + parentEvidenceHash).digest('hex');

    if (isProdLike) {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_staging_evidence 
         (evidence_id, activation_token_staging_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json) 
         VALUES (?, ?, '158.0', ?, ?, ?)`,
        [evidenceId, tokenStagingRecord.activation_token_staging_id, evidencePackHash, JSON.stringify(evidencePayload), JSON.stringify(currentChain)]
      );
    }

    return { evidenceId, evidencePackHash, lineageHashChain: currentChain };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenStagingEvidencePackService()
};
