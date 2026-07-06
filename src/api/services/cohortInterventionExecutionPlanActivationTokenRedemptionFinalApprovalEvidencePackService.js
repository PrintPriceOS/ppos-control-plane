'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

class CohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalEvidencePackService {
  async generateEvidencePack(tokenFinalApprovalRecord, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let parentEvidenceHash = 'none';
    let lineageHashChain = {
      phase137: 'none', phase138: 'none', phase139: 'none', phase140: 'none',
      phase141: 'none', phase142: 'none', phase143: 'none', phase144: 'none',
      phase145: 'none', phase146: 'none', phase147: 'none', phase148: 'none',
      phase149: 'none', phase150: 'none', phase151: 'none', phase152: 'none',
      phase153: 'none', phase154: 'none', phase155: 'none', phase156: 'none',
      phase157: 'none', phase158: 'none', phase159: 'none', phase160: 'none',
      phase161: 'none', phase162: 'none', phase163: 'none'
    };

    if (isProdLike) {
      const parentEnvEvidence = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_env_ev 
         WHERE activation_token_redemption_envelope_id = ? ORDER BY created_at DESC LIMIT 1`,
        [tokenFinalApprovalRecord.source_activation_token_redemption_env_id]
      );
      if (parentEnvEvidence && parentEnvEvidence[0]) {
        parentEvidenceHash = parentEnvEvidence[0].evidence_pack_hash;
        const parentChain = typeof parentEnvEvidence[0].lineage_hash_chain_json === 'string'
          ? JSON.parse(parentEnvEvidence[0].lineage_hash_chain_json)
          : parentEnvEvidence[0].lineage_hash_chain_json;
        lineageHashChain = { ...parentChain, phase163: parentEvidenceHash };
      }
    } else {
      parentEvidenceHash = 'env_mock_hash_164';
      lineageHashChain.phase163 = parentEvidenceHash;
      lineageHashChain.phase162 = 'ath_mock_hash_164';
      lineageHashChain.phase161 = 'rdy_mock_hash_164';
      lineageHashChain.phase160 = 'iss_mock_hash_164';
    }

    const currentChain = { ...lineageHashChain, phase164_token_redemption_final_approval: tokenFinalApprovalRecord.activation_token_redemption_final_apv_hash };

    const evidencePayload = {
      evidence_schema_version: '164.0',
      activation_token_redemption_final_approval_id: tokenFinalApprovalRecord.activation_token_redemption_final_apv_id,
      parent_envelope_id: tokenFinalApprovalRecord.source_activation_token_redemption_env_id,
      risk_level: tokenFinalApprovalRecord.risk_level,
      confidence_level: tokenFinalApprovalRecord.confidence_level,
      projected_impact_score: tokenFinalApprovalRecord.projected_impact_score,
      rollback_feasibility_score: tokenFinalApprovalRecord.rollback_feasibility_score,
      evidence_completeness_score: tokenFinalApprovalRecord.evidence_completeness_score,
      non_execution_attestation: tokenFinalApprovalRecord.non_execution_attestation_json,
      write_scope_attestation: tokenFinalApprovalRecord.write_scope_attestation_json,
      non_redeemable_token_record: tokenFinalApprovalRecord.non_redeemable_token_record_json,
      redemption_final_approval_metadata: tokenFinalApprovalRecord.redemption_final_apv_metadata_json,
      redemption_final_approval_by: actorId,
      redemption_final_approval_at: new Date(),
      redacted_system_token_material: '[REDACTED_SECURE_TOKEN_MATERIAL_FINAL_APPROVAL_ONLY]',
      allow_token_redemption_assertion: 'Phase 164 is not token redemption. It only records final approval for a future redemption path.'
    };

    const evidenceId = 'ev_fapv_' + crypto.randomBytes(8).toString('hex');
    const evidencePackHash = 'ep_fapv_' + crypto.createHash('sha256')
      .update(JSON.stringify(evidencePayload) + '-' + parentEvidenceHash)
      .digest('hex');

    if (isProdLike) {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_fapv_ev 
         (evidence_id, activation_token_redemption_final_apv_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json) 
         VALUES (?, ?, '164.0', ?, ?, ?)`,
        [evidenceId, tokenFinalApprovalRecord.activation_token_redemption_final_apv_id, evidencePackHash,
          JSON.stringify(evidencePayload), JSON.stringify(currentChain)]
      );
    }

    return { evidenceId, evidencePackHash, lineageHashChain: currentChain };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalEvidencePackService()
};
