'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalBuilderService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalEvidencePackService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalDecisionService {
  async recordDecision(activationTokenRedemptionFinalApvId, decision, rationale, actorId) {
    const record = await builder.getTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId);
    if (!record) throw new Error('TOKEN_REDEMPTION_FINAL_APPROVAL_RECORD_NOT_FOUND');

    if (record.activation_token_redemption_final_apv_status !== 'EVALUATED') {
      throw new Error('TOKEN_REDEMPTION_FINAL_APPROVAL_NOT_EVALUATED');
    }

    const isApproved = decision === 'APPROVE';
    const status = isApproved ? 'FINAL_APV_PASSED' : 'FINAL_APV_FAILED';
    const result = isApproved ? 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED' : 'REDEMPTION_FINAL_APV_FAILED';

    await builder.updateTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId, {
      activation_token_redemption_final_apv_status: status,
      activation_token_redemption_final_apv_result: result,
      redemption_final_apv_metadata_json: { rationale, decided_by: actorId, decided_at: new Date() }
    });

    await auditSvc.createAuditLog(activationTokenRedemptionFinalApvId, 'TOKEN_REDEMPTION_FINAL_APPROVAL_DECISION_RECORDED', actorId, { decision, status, result });
    return { status, result };
  }

  async finalizeRedemptionFinalApproval(activationTokenRedemptionFinalApvId, actorId) {
    const record = await builder.getTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId);
    if (!record) throw new Error('TOKEN_REDEMPTION_FINAL_APPROVAL_RECORD_NOT_FOUND');

    if (record.activation_token_redemption_final_apv_status !== 'FINAL_APV_PASSED') {
      throw new Error('TOKEN_REDEMPTION_FINAL_APPROVAL_NOT_PASSED');
    }

    const stringifiedForHash = record.activation_token_redemption_final_apv_id + '-' +
      record.source_activation_token_redemption_env_id + '-' +
      record.activation_token_redemption_final_apv_status + '-' +
      record.activation_token_redemption_final_apv_result;
    const finalApvHash = 'fapv_hash_' + crypto.createHash('sha256').update(stringifiedForHash).digest('hex');

    await builder.updateTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId, {
      activation_token_redemption_final_apv_status: 'FINALIZED',
      activation_token_redemption_final_apv_hash: finalApvHash,
      finalized_by: actorId,
      finalized_at: new Date()
    });

    const finalRecord = await builder.getTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId);
    const evidence = await evidenceSvc.generateEvidencePack(finalRecord, actorId);

    // Bypass immutable lock for post-finalize evidence write
    await builder._internalUpdateTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId, {
      token_redemption_final_apv_evidence_pack_hash: evidence.evidencePackHash,
      evidence_pack_hash: evidence.evidencePackHash,
      lineage_hash_chain_json: evidence.lineageHashChain
    });

    await auditSvc.createAuditLog(activationTokenRedemptionFinalApvId, 'TOKEN_REDEMPTION_FINAL_APPROVAL_FINALIZED', actorId,
      { finalApvHash, evidencePackHash: evidence.evidencePackHash });
    return await builder.getTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalDecisionService()
};
