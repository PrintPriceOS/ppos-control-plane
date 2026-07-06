'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

class CohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationEvidencePackService {
  async generateEvidencePack(tokenAuthRecord, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let parentEvidenceHash = 'none';
    let lineageHashChain = {
      phase137: 'none', phase138: 'none', phase139: 'none', phase140: 'none',
      phase141: 'none', phase142: 'none', phase143: 'none', phase144: 'none',
      phase145: 'none', phase146: 'none', phase147: 'none', phase148: 'none',
      phase149: 'none', phase150: 'none', phase151: 'none', phase152: 'none',
      phase153: 'none', phase154: 'none', phase155: 'none', phase156: 'none',
      phase157: 'none', phase158: 'none', phase159: 'none', phase160: 'none',
      phase161: 'none'
    };

    if (isProdLike) {
      const parentReadinessEvidence = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_readiness_ev 
         WHERE activation_token_redemption_readiness_id = ? ORDER BY created_at DESC LIMIT 1`,
        [tokenAuthRecord.source_activation_token_redemption_readiness_id]
      );
      if (parentReadinessEvidence && parentReadinessEvidence[0]) {
        parentEvidenceHash = parentReadinessEvidence[0].evidence_pack_hash;
        const parentChain = typeof parentReadinessEvidence[0].lineage_hash_chain_json === 'string'
          ? JSON.parse(parentReadinessEvidence[0].lineage_hash_chain_json)
          : parentReadinessEvidence[0].lineage_hash_chain_json;
        lineageHashChain = { ...parentChain, phase161: parentEvidenceHash };
      }
    } else {
      parentEvidenceHash = 'rdy_mock_hash_162';
      lineageHashChain.phase161 = parentEvidenceHash;
      lineageHashChain.phase160 = 'iss_mock_hash_162';
    }

    const currentChain = { ...lineageHashChain, phase162_token_redemption_authorization: tokenAuthRecord.activation_token_redemption_auth_hash };

    const evidencePayload = {
      evidence_schema_version: '162.0',
      activation_token_redemption_auth_id: tokenAuthRecord.activation_token_redemption_auth_id,
      parent_readiness_id: tokenAuthRecord.source_activation_token_redemption_readiness_id,
      risk_level: tokenAuthRecord.risk_level,
      confidence_level: tokenAuthRecord.confidence_level,
      projected_impact_score: tokenAuthRecord.projected_impact_score,
      rollback_feasibility_score: tokenAuthRecord.rollback_feasibility_score,
      evidence_completeness_score: tokenAuthRecord.evidence_completeness_score,
      non_execution_attestation: tokenAuthRecord.non_execution_attestation_json,
      write_scope_attestation: tokenAuthRecord.write_scope_attestation_json,
      non_redeemable_token_record: tokenAuthRecord.non_redeemable_token_record_json,
      redemption_auth_metadata: tokenAuthRecord.redemption_auth_metadata_json,
      redemption_auth_by: actorId,
      redemption_auth_at: new Date(),
      redacted_system_token_material: '[REDACTED_SECURE_TOKEN_MATERIAL_REDEMPTION_AUTHORIZATION_ONLY]',
      allow_token_redemption_assertion: 'Phase 162 is not token redemption. It only authorizes a future redemption path.'
    };

    const evidenceId = 'ev_ath_' + crypto.randomBytes(8).toString('hex');
    const evidencePackHash = 'ep_ath_' + crypto.createHash('sha256')
      .update(JSON.stringify(evidencePayload) + '-' + parentEvidenceHash)
      .digest('hex');

    if (isProdLike) {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_auth_ev 
         (evidence_id, activation_token_redemption_auth_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json) 
         VALUES (?, ?, '162.0', ?, ?, ?)`,
        [evidenceId, tokenAuthRecord.activation_token_redemption_auth_id, evidencePackHash,
          JSON.stringify(evidencePayload), JSON.stringify(currentChain)]
      );
    }

    return { evidenceId, evidencePackHash, lineageHashChain: currentChain };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationEvidencePackService()
};
