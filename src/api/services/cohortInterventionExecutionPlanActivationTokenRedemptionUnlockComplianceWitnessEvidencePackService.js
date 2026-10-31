'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const parentBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealBuilderService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessEvidencePackService {
  constructor() {
    this._mockEvidence = new Map();
  }

  async generateEvidencePack(record) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const parentFinalHumanSeal = await parentBuilder.getTokenRedemptionUnlockFinalHumanAuthorizationSeal(record.source_act_token_redempt_unlock_final_human_auth_seal_id);
    if (!parentFinalHumanSeal) {
      throw new Error(`Parent final human authorization seal ${record.source_act_token_redempt_unlock_final_human_auth_seal_id} not found.`);
    }

    const lineageHashChain = {
      phase174_unlock_compliance_witness:
        record.unlock_compliance_witness_hash ||
        record.unlock_compliance_witness_evidence_pack_hash ||
        record.evidence_pack_hash ||
        'cwn_hash_dummy',

      phase173_unlock_final_human_authorization_seal:
        record.source_unlock_final_human_authorization_seal_hash ||
        parentFinalHumanSeal.unlock_final_human_authorization_seal_hash ||
        parentFinalHumanSeal.evidence_pack_hash ||
        'fhas_hash_dummy',

      phase172_unlock_dual_control_authorization:
        record.source_unlock_dual_control_authorization_hash ||
        parentFinalHumanSeal.source_unlock_dual_control_authorization_hash ||
        'dcau_hash_dummy',

      phase171_unlock_operator_attestation:
        record.source_unlock_operator_attestation_hash ||
        parentFinalHumanSeal.source_unlock_operator_attestation_hash ||
        'oatt_hash_dummy',

      phase170_unlock_pre_execution_freeze:
        record.source_unlock_pre_execution_freeze_hash ||
        parentFinalHumanSeal.source_unlock_pre_execution_freeze_hash ||
        'pfrz_hash_dummy',

      phase169_unlock_readiness_seal:
        record.source_unlock_seal_hash ||
        parentFinalHumanSeal.source_unlock_seal_hash ||
        'seal_hash_dummy',

      phase168_unlock_final_review:
        record.source_unlock_final_review_hash ||
        parentFinalHumanSeal.source_unlock_final_review_hash ||
        'frev_hash_dummy',

      phase167_unlock_approval:
        record.source_unlock_approval_hash ||
        parentFinalHumanSeal.source_unlock_approval_hash ||
        'apv_hash_dummy',

      phase166_unlock_eligibility:
        record.source_unlock_eligibility_hash ||
        parentFinalHumanSeal.source_unlock_eligibility_hash ||
        'elig_hash_dummy',

      phase165_redemption_lock:
        record.source_redemption_lock_hash ||
        parentFinalHumanSeal.source_redemption_lock_hash ||
        'lock_hash_dummy',

      phase164_redemption_final_approval:
        record.source_redemption_final_approval_hash ||
        parentFinalHumanSeal.source_redemption_final_approval_hash ||
        'fapv_hash_dummy',

      token_material:
        record.source_token_material_hash ||
        parentFinalHumanSeal.source_token_material_hash ||
        'token_material_hash_dummy',

      redemption_package_freeze:
        record.source_redemption_package_freeze_hash ||
        parentFinalHumanSeal.source_redemption_package_freeze_hash ||
        'freeze_hash_dummy'
    };

    // Minimization of sensitive data: hash identities
    const redactedWitnessId = record.compliance_witness_id ? crypto.createHash('sha256').update(record.compliance_witness_id).digest('hex').substring(0, 16) : null;
    const redactedFinalId = record.final_human_authorizer_id ? crypto.createHash('sha256').update(record.final_human_authorizer_id).digest('hex').substring(0, 16) : null;
    const redactedPrimaryId = record.primary_authorizer_id ? crypto.createHash('sha256').update(record.primary_authorizer_id).digest('hex').substring(0, 16) : null;
    const redactedSecondaryId = record.secondary_authorizer_id ? crypto.createHash('sha256').update(record.secondary_authorizer_id).digest('hex').substring(0, 16) : null;

    const payload = {
      evidence_schema_version: '174.0',
      act_token_redempt_unlock_compliance_witness_id: record.act_token_redempt_unlock_compliance_witness_id,
      source_act_token_redempt_unlock_final_human_auth_seal_id: record.source_act_token_redempt_unlock_final_human_auth_seal_id,
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
      unlock_compliance_witness_status: record.unlock_compliance_witness_status,
      unlock_compliance_witness_result: record.unlock_compliance_witness_result,
      compliance_witness_id_sha256: redactedWitnessId,
      compliance_witness_role: record.compliance_witness_role,
      final_human_authorizer_id_sha256: redactedFinalId,
      primary_authorizer_id_sha256: redactedPrimaryId,
      secondary_authorizer_id_sha256: redactedSecondaryId,
      lineageHashChain
    };

    const evidencePackHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const evidenceId = `ev_${crypto.randomBytes(8).toString('hex')}`;

    const epRecord = {
      evidence_id: evidenceId,
      act_token_redempt_unlock_compliance_witness_id: record.act_token_redempt_unlock_compliance_witness_id,
      evidence_schema_version: '174.0',
      evidence_pack_hash: evidencePackHash,
      evidence_payload_json: JSON.stringify(payload),
      lineage_hash_chain_json: JSON.stringify(lineageHashChain),
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockEvidence.set(record.act_token_redempt_unlock_compliance_witness_id, epRecord);
      return {
        evidence_pack_hash: evidencePackHash,
        lineageHashChain,
        evidence_payload_json: epRecord.evidence_payload_json,
        lineage_hash_chain_json: epRecord.lineage_hash_chain_json
      };
    }

    await db.query(
      `DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_cwn_ev WHERE act_token_redempt_unlock_compliance_witness_id = ?`,
      [record.act_token_redempt_unlock_compliance_witness_id]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_cwn_ev
       (evidence_id, act_token_redempt_unlock_compliance_witness_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [evidenceId, record.act_token_redempt_unlock_compliance_witness_id, '174.0', evidencePackHash, epRecord.evidence_payload_json, epRecord.lineage_hash_chain_json]
    );

    return {
      evidence_pack_hash: evidencePackHash,
      lineageHashChain,
      evidence_payload_json: epRecord.evidence_payload_json,
      lineage_hash_chain_json: epRecord.lineage_hash_chain_json
    };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessEvidencePackService()
};
