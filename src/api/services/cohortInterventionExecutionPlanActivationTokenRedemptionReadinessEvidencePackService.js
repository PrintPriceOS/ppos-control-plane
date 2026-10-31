'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

class CohortInterventionExecutionPlanActivationTokenRedemptionReadinessEvidencePackService {
  async generateEvidencePack(tokenReadinessRecord, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let parentEvidenceHash = 'none';
    let lineageHashChain = {
      phase137: 'none', phase138: 'none', phase139: 'none', phase140: 'none',
      phase141: 'none', phase142: 'none', phase143: 'none', phase144: 'none',
      phase145: 'none', phase146: 'none', phase147: 'none', phase148: 'none',
      phase149: 'none', phase150: 'none', phase151: 'none', phase152: 'none',
      phase153: 'none', phase154: 'none', phase155: 'none', phase156: 'none',
      phase157: 'none', phase158: 'none', phase159: 'none', phase160: 'none'
    };

    if (isProdLike) {
      const parentIssuanceEvidence = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_issuance_evidence 
         WHERE activation_token_issuance_id = ? ORDER BY created_at DESC LIMIT 1`,
        [tokenReadinessRecord.source_activation_token_issuance_id]
      );
      if (parentIssuanceEvidence && parentIssuanceEvidence[0]) {
        parentEvidenceHash = parentIssuanceEvidence[0].evidence_pack_hash;
        const parentChain = typeof parentIssuanceEvidence[0].lineage_hash_chain_json === 'string'
          ? JSON.parse(parentIssuanceEvidence[0].lineage_hash_chain_json)
          : parentIssuanceEvidence[0].lineage_hash_chain_json;
        lineageHashChain = { ...parentChain, phase160: parentEvidenceHash };
      }
    } else {
      parentEvidenceHash = 'iss_mock_hash_161';
      lineageHashChain.phase160 = parentEvidenceHash;
      lineageHashChain.phase159 = 'pfl_mock_hash_161';
    }

    const currentChain = { ...lineageHashChain, phase161_token_redemption_readiness: tokenReadinessRecord.activation_token_redemption_readiness_hash };

    const evidencePayload = {
      evidence_schema_version: '161.0',
      activation_token_redemption_readiness_id: tokenReadinessRecord.activation_token_redemption_readiness_id,
      parent_issuance_id: tokenReadinessRecord.source_activation_token_issuance_id,
      risk_level: tokenReadinessRecord.risk_level,
      confidence_level: tokenReadinessRecord.confidence_level,
      projected_impact_score: tokenReadinessRecord.projected_impact_score,
      rollback_feasibility_score: tokenReadinessRecord.rollback_feasibility_score,
      evidence_completeness_score: tokenReadinessRecord.evidence_completeness_score,
      non_execution_attestation: tokenReadinessRecord.non_execution_attestation_json,
      write_scope_attestation: tokenReadinessRecord.write_scope_attestation_json,
      non_redeemable_token_record: tokenReadinessRecord.non_redeemable_token_record_json,
      redemption_readiness_metadata: tokenReadinessRecord.redemption_readiness_metadata_json,
      redemption_readiness_by: actorId,
      redemption_readiness_at: new Date(),
      redacted_system_token_material: '[REDACTED_SECURE_TOKEN_MATERIAL_REDEMPTION_READINESS_ONLY]',
      allow_token_redemption_assertion: 'Phase 161 is not redemption. It only validates readiness for a future redemption gate.'
    };

    const evidenceId = 'ev_atr_' + crypto.randomBytes(8).toString('hex');
    const evidencePackHash = 'ep_atr_' + crypto.createHash('sha256')
      .update(JSON.stringify(evidencePayload) + '-' + parentEvidenceHash)
      .digest('hex');

    if (isProdLike) {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_readiness_ev 
         (evidence_id, activation_token_redemption_readiness_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json) 
         VALUES (?, ?, '161.0', ?, ?, ?)`,
        [evidenceId, tokenReadinessRecord.activation_token_redemption_readiness_id, evidencePackHash,
          JSON.stringify(evidencePayload), JSON.stringify(currentChain)]
      );
    }

    return { evidenceId, evidencePackHash, lineageHashChain: currentChain };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionReadinessEvidencePackService()
};
