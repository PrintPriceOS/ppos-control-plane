'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionReadinessEvidencePackService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionReadinessAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionReadinessDecisionService {
  async recordDecision(activationTokenRedemptionReadinessId, decision, rationale, actorId) {
    const record = await builder.getTokenRedemptionReadiness(activationTokenRedemptionReadinessId);
    if (!record) throw new Error('TOKEN_REDEMPTION_READINESS_RECORD_NOT_FOUND');

    if (record.activation_token_redemption_readiness_status !== 'EVALUATED') {
      throw new Error('TOKEN_REDEMPTION_READINESS_NOT_EVALUATED');
    }

    const isApproved = decision === 'APPROVE';
    const status = isApproved ? 'READINESS_PASSED' : 'READINESS_FAILED';
    const result = isApproved ? 'REDEMPTION_READINESS_PASSED_NOT_REDEEMED' : 'REDEMPTION_READINESS_FAILED';

    await builder.updateTokenRedemptionReadiness(activationTokenRedemptionReadinessId, {
      activation_token_redemption_readiness_status: status,
      activation_token_redemption_readiness_result: result,
      redemption_readiness_metadata_json: { rationale, decided_by: actorId, decided_at: new Date() }
    });

    await auditSvc.createAuditLog(activationTokenRedemptionReadinessId, 'TOKEN_REDEMPTION_READINESS_DECISION_RECORDED', actorId, { decision, status, result });
    return { status, result };
  }

  async finalizeRedemptionReadiness(activationTokenRedemptionReadinessId, actorId) {
    const record = await builder.getTokenRedemptionReadiness(activationTokenRedemptionReadinessId);
    if (!record) throw new Error('TOKEN_REDEMPTION_READINESS_RECORD_NOT_FOUND');

    if (record.activation_token_redemption_readiness_status !== 'READINESS_PASSED') {
      throw new Error('TOKEN_REDEMPTION_READINESS_NOT_PASSED');
    }

    const stringifiedForHash = record.activation_token_redemption_readiness_id + '-' +
      record.source_activation_token_issuance_id + '-' +
      record.activation_token_redemption_readiness_status + '-' +
      record.activation_token_redemption_readiness_result;
    const readinessHash = 'rdy_' + crypto.createHash('sha256').update(stringifiedForHash).digest('hex');

    await builder.updateTokenRedemptionReadiness(activationTokenRedemptionReadinessId, {
      activation_token_redemption_readiness_status: 'FINALIZED',
      activation_token_redemption_readiness_hash: readinessHash,
      finalized_by: actorId,
      finalized_at: new Date()
    });

    const finalRecord = await builder.getTokenRedemptionReadiness(activationTokenRedemptionReadinessId);
    const evidence = await evidenceSvc.generateEvidencePack(finalRecord, actorId);

    // Bypass inmutable guard for post-FINALIZED evidence write
    await builder._internalUpdateTokenRedemptionReadiness(activationTokenRedemptionReadinessId, {
      token_redemption_readiness_evidence_pack_hash: evidence.evidencePackHash,
      evidence_pack_hash: evidence.evidencePackHash,
      lineage_hash_chain_json: evidence.lineageHashChain
    });

    await auditSvc.createAuditLog(activationTokenRedemptionReadinessId, 'TOKEN_REDEMPTION_READINESS_FINALIZED', actorId,
      { readinessHash, evidencePackHash: evidence.evidencePackHash });
    return await builder.getTokenRedemptionReadiness(activationTokenRedemptionReadinessId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionReadinessDecisionService()
};
