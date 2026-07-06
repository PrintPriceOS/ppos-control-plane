'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

class CohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeEvidencePackService {
  async generateEvidencePack(tokenEnvelopeRecord, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let parentEvidenceHash = 'none';
    let lineageHashChain = {
      phase137: 'none', phase138: 'none', phase139: 'none', phase140: 'none',
      phase141: 'none', phase142: 'none', phase143: 'none', phase144: 'none',
      phase145: 'none', phase146: 'none', phase147: 'none', phase148: 'none',
      phase149: 'none', phase150: 'none', phase151: 'none', phase152: 'none',
      phase153: 'none', phase154: 'none', phase155: 'none', phase156: 'none',
      phase157: 'none', phase158: 'none', phase159: 'none', phase160: 'none',
      phase161: 'none', phase162: 'none'
    };

    if (isProdLike) {
      const parentAuthEvidence = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_auth_ev 
         WHERE activation_token_redemption_auth_id = ? ORDER BY created_at DESC LIMIT 1`,
        [tokenEnvelopeRecord.source_activation_token_redemption_auth_id]
      );
      if (parentAuthEvidence && parentAuthEvidence[0]) {
        parentEvidenceHash = parentAuthEvidence[0].evidence_pack_hash;
        const parentChain = typeof parentAuthEvidence[0].lineage_hash_chain_json === 'string'
          ? JSON.parse(parentAuthEvidence[0].lineage_hash_chain_json)
          : parentAuthEvidence[0].lineage_hash_chain_json;
        lineageHashChain = { ...parentChain, phase162: parentEvidenceHash };
      }
    } else {
      parentEvidenceHash = 'ath_mock_hash_163';
      lineageHashChain.phase162 = parentEvidenceHash;
      lineageHashChain.phase161 = 'rdy_mock_hash_163';
      lineageHashChain.phase160 = 'iss_mock_hash_163';
    }

    const currentChain = { ...lineageHashChain, phase163_token_redemption_envelope: tokenEnvelopeRecord.activation_token_redemption_envelope_hash };

    const evidencePayload = {
      evidence_schema_version: '163.0',
      activation_token_redemption_envelope_id: tokenEnvelopeRecord.activation_token_redemption_env_id,
      parent_authorization_id: tokenEnvelopeRecord.source_activation_token_redemption_auth_id,
      risk_level: tokenEnvelopeRecord.risk_level,
      confidence_level: tokenEnvelopeRecord.confidence_level,
      projected_impact_score: tokenEnvelopeRecord.projected_impact_score,
      rollback_feasibility_score: tokenEnvelopeRecord.rollback_feasibility_score,
      evidence_completeness_score: tokenEnvelopeRecord.evidence_completeness_score,
      non_execution_attestation: tokenEnvelopeRecord.non_execution_attestation_json,
      write_scope_attestation: tokenEnvelopeRecord.write_scope_attestation_json,
      non_redeemable_token_record: tokenEnvelopeRecord.non_redeemable_token_record_json,
      redemption_envelope_metadata: tokenEnvelopeRecord.redemption_envelope_metadata_json,
      redemption_envelope_by: actorId,
      redemption_envelope_at: new Date(),
      redacted_system_token_material: '[REDACTED_SECURE_TOKEN_MATERIAL_REDEMPTION_ENVELOPE_ONLY]',
      allow_token_redemption_assertion: 'Phase 163 is not token redemption. It only prepares a non-redeemable redemption envelope.'
    };

    const evidenceId = 'ev_env_' + crypto.randomBytes(8).toString('hex');
    const evidencePackHash = 'ep_env_' + crypto.createHash('sha256')
      .update(JSON.stringify(evidencePayload) + '-' + parentEvidenceHash)
      .digest('hex');

    if (isProdLike) {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_env_ev 
         (evidence_id, activation_token_redemption_envelope_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json) 
         VALUES (?, ?, '163.0', ?, ?, ?)`,
        [evidenceId, tokenEnvelopeRecord.activation_token_redemption_env_id, evidencePackHash,
          JSON.stringify(evidencePayload), JSON.stringify(currentChain)]
      );
    }

    return { evidenceId, evidencePackHash, lineageHashChain: currentChain };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeEvidencePackService()
};
