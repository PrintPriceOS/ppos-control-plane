'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

class CohortInterventionExecutionPlanActivationTokenIssuanceEvidencePackService {
  async generateEvidencePack(tokenIssuanceRecord, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let parentEvidenceHash = 'none';
    let lineageHashChain = {
      phase137: 'none', phase138: 'none', phase139: 'none', phase140: 'none',
      phase141: 'none', phase142: 'none', phase143: 'none', phase144: 'none',
      phase145: 'none', phase146: 'none', phase147: 'none', phase148: 'none',
      phase149: 'none', phase150: 'none', phase151: 'none', phase152: 'none',
      phase153: 'none', phase154: 'none', phase155: 'none', phase156: 'none',
      phase157: 'none', phase158: 'none', phase159: 'none'
    };

    if (isProdLike) {
      const parentPreflightEvidence = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_preflight_evidence 
         WHERE activation_token_preflight_id = ? ORDER BY created_at DESC LIMIT 1`,
        [tokenIssuanceRecord.source_activation_token_preflight_id]
      );
      if (parentPreflightEvidence && parentPreflightEvidence[0]) {
        parentEvidenceHash = parentPreflightEvidence[0].evidence_pack_hash;
        const parentChain = typeof parentPreflightEvidence[0].lineage_hash_chain_json === 'string'
          ? JSON.parse(parentPreflightEvidence[0].lineage_hash_chain_json)
          : parentPreflightEvidence[0].lineage_hash_chain_json;
        lineageHashChain = { ...parentChain, phase159: parentEvidenceHash };
      }
    } else {
      parentEvidenceHash = 'pfl_mock_hash_160';
      lineageHashChain.phase159 = parentEvidenceHash;
      lineageHashChain.phase158 = 'stg_mock_hash_160';
    }

    const currentChain = { ...lineageHashChain, phase160_token_issuance: tokenIssuanceRecord.activation_token_issuance_hash };

    const evidencePayload = {
      evidence_schema_version: '160.0',
      activation_token_issuance_id: tokenIssuanceRecord.activation_token_issuance_id,
      parent_preflight_id: tokenIssuanceRecord.source_activation_token_preflight_id,
      risk_level: tokenIssuanceRecord.risk_level,
      confidence_level: tokenIssuanceRecord.confidence_level,
      projected_impact_score: tokenIssuanceRecord.projected_impact_score,
      rollback_feasibility_score: tokenIssuanceRecord.rollback_feasibility_score,
      evidence_completeness_score: tokenIssuanceRecord.evidence_completeness_score,
      non_execution_attestation: tokenIssuanceRecord.non_execution_attestation_json,
      write_scope_attestation: tokenIssuanceRecord.write_scope_attestation_json,
      non_redeemable_token_record: tokenIssuanceRecord.non_redeemable_token_record_json,
      issuance_metadata: tokenIssuanceRecord.issuance_metadata_json,
      issuance_by: actorId,
      issuance_at: new Date(),
      redacted_system_token_material: '[REDACTED_SECURE_TOKEN_MATERIAL_ISSUANCE_RECORD_ONLY]',
      allow_token_issue_assertion: 'allow_token_issue=true is scoped only to non-redeemable issuance record creation. It does not permit credential activation, redemption, runtime access, or execution.'
    };

    const evidenceId = 'ev_iss_' + crypto.randomBytes(8).toString('hex');
    const evidencePackHash = 'ep_iss_' + crypto.createHash('sha256')
      .update(JSON.stringify(evidencePayload) + '-' + parentEvidenceHash)
      .digest('hex');

    if (isProdLike) {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_issuance_evidence 
         (evidence_id, activation_token_issuance_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json) 
         VALUES (?, ?, '160.0', ?, ?, ?)`,
        [evidenceId, tokenIssuanceRecord.activation_token_issuance_id, evidencePackHash,
          JSON.stringify(evidencePayload), JSON.stringify(currentChain)]
      );
    }

    return { evidenceId, evidencePackHash, lineageHashChain: currentChain };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenIssuanceEvidencePackService()
};
