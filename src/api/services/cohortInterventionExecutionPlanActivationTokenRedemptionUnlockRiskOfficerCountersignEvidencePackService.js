'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignBuilderService').serviceInstance;
const parentBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessBuilderService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignEvidencePackService {
  constructor() {
    this._mockEvidence = new Map();
  }

  async generateEvidencePack(unlockRiskOfficerCountersignId, actorId) {
    const record = await builder.getTokenRedemptionUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId);
    if (!record) {
      throw new Error(`Record ${unlockRiskOfficerCountersignId} not found`);
    }

    const parent = await parentBuilder.getTokenRedemptionUnlockComplianceWitness(record.source_act_token_redempt_unlock_compliance_witness_id);
    if (!parent) {
      throw new Error(`Parent compliance witness ${record.source_act_token_redempt_unlock_compliance_witness_id} not found`);
    }

    const sha256 = (val) => val ? crypto.createHash('sha256').update(val).digest('hex') : '';

    const evidencePayload = {
      evidence_schema_version: '175.0',
      act_token_redempt_unlock_risk_officer_countersign_id: unlockRiskOfficerCountersignId,
      source_act_token_redempt_unlock_compliance_witness_id: record.source_act_token_redempt_unlock_compliance_witness_id,
      primary_authorizer_id_sha256: sha256(record.primary_authorizer_id),
      secondary_authorizer_id_sha256: sha256(record.secondary_authorizer_id),
      final_human_authorizer_id_sha256: sha256(record.final_human_authorizer_id),
      compliance_witness_id_sha256: sha256(record.compliance_witness_id),
      risk_officer_id_sha256: sha256(record.risk_officer_id),
      risk_officer_role: record.risk_officer_role,
      risk_officer_countersigned_at: record.risk_officer_countersigned_at,
      safety_boundary_state: {
        token_unlock_status: record.token_unlock_status,
        token_redeemable_status: record.token_redeemable_status,
        token_redemption_status: record.token_redemption_status,
        plan_executable_status: record.plan_executable_status,
        job_creation_status: record.job_creation_status,
        queue_dispatch_status: record.queue_dispatch_status,
        runtime_mutation_status: record.runtime_mutation_status
      },
      independence_assertions: {
        risk_officer_is_independent_from_primary: record.risk_officer_id !== record.primary_authorizer_id,
        risk_officer_is_independent_from_secondary: record.risk_officer_id !== record.secondary_authorizer_id,
        risk_officer_is_independent_from_final_human: record.risk_officer_id !== record.final_human_authorizer_id,
        risk_officer_is_independent_from_compliance_witness: record.risk_officer_id !== record.compliance_witness_id
      }
    };

    const payloadStr = JSON.stringify(evidencePayload);
    const evidencePackHash = crypto.createHash('sha256').update(payloadStr).digest('hex');

    const lineageHashChain = {
      phase175_unlock_risk_officer_countersign: evidencePackHash,
      phase174_unlock_compliance_witness: record.source_unlock_compliance_witness_hash || parent.evidence_pack_hash || 'cwn_hash_dummy',
      phase173_unlock_final_human_authorization_seal: record.source_unlock_final_human_authorization_seal_hash || parent.source_unlock_final_human_authorization_seal_hash || 'fhas_hash_dummy',
      phase172_unlock_dual_control_authorization: record.source_unlock_dual_control_authorization_hash || parent.source_unlock_dual_control_authorization_hash || 'dcau_hash_dummy',
      phase171_unlock_operator_attestation: record.source_unlock_operator_attestation_hash || parent.source_unlock_operator_attestation_hash || 'oatt_hash_dummy',
      phase170_unlock_pre_execution_freeze: record.source_unlock_pre_execution_freeze_hash || parent.source_unlock_pre_execution_freeze_hash || 'pfrz_hash_dummy',
      phase169_unlock_readiness_seal: record.source_unlock_seal_hash || parent.source_unlock_seal_hash || 'seal_hash_dummy',
      phase168_unlock_final_review: record.source_unlock_final_review_hash || parent.source_unlock_final_review_hash || 'frev_hash_dummy',
      phase167_unlock_approval: record.source_unlock_approval_hash || parent.source_unlock_approval_hash || 'apv_hash_dummy',
      phase166_unlock_eligibility: record.source_unlock_eligibility_hash || parent.source_unlock_eligibility_hash || 'elig_hash_dummy',
      phase165_redemption_lock: record.source_redemption_lock_hash || parent.source_redemption_lock_hash || 'lock_hash_dummy',
      phase164_redemption_final_approval: record.source_redemption_final_approval_hash || parent.source_redemption_final_approval_hash || 'fapv_hash_dummy',
      token_material: record.source_token_material_hash || parent.source_token_material_hash || 'token_material_hash_dummy',
      redemption_package_freeze: record.source_redemption_package_freeze_hash || parent.source_redemption_package_freeze_hash || 'freeze_hash_dummy'
    };

    const lineageStr = JSON.stringify(lineageHashChain);
    const evidenceId = 'ev_roc_' + crypto.randomBytes(8).toString('hex');

    if (!isProdLike) {
      this._mockEvidence.set(unlockRiskOfficerCountersignId, {
        evidence_id: evidenceId,
        act_token_redempt_unlock_risk_officer_countersign_id: unlockRiskOfficerCountersignId,
        evidence_schema_version: '175.0',
        evidence_pack_hash: evidencePackHash,
        evidence_payload_json: payloadStr,
        lineage_hash_chain_json: lineageStr,
        created_at: new Date()
      });
    } else {
      await db.query(
        `DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_roc_ev
         WHERE act_token_redempt_unlock_risk_officer_countersign_id = ?`,
        [unlockRiskOfficerCountersignId]
      );
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_roc_ev
         (evidence_id, act_token_redempt_unlock_risk_officer_countersign_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [evidenceId, unlockRiskOfficerCountersignId, '175.0', evidencePackHash, payloadStr, lineageStr]
      );
    }

    return {
      evidence_pack_hash: evidencePackHash,
      lineage_hash_chain_json: lineageHashChain
    };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignEvidencePackService()
};
