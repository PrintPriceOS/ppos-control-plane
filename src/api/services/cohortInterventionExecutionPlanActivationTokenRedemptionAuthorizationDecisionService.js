'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationEvidencePackService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationDecisionService {
  async recordDecision(activationTokenRedemptionAuthId, decision, rationale, actorId) {
    const record = await builder.getTokenRedemptionAuth(activationTokenRedemptionAuthId);
    if (!record) throw new Error('TOKEN_REDEMPTION_AUTH_RECORD_NOT_FOUND');

    if (record.activation_token_redemption_auth_status !== 'EVALUATED') {
      throw new Error('TOKEN_REDEMPTION_AUTH_NOT_EVALUATED');
    }

    const isApproved = decision === 'APPROVE';
    const status = isApproved ? 'AUTH_PASSED' : 'AUTH_FAILED';
    const result = isApproved ? 'REDEMPTION_AUTHORIZED_NOT_REDEEMED' : 'REDEMPTION_AUTH_FAILED';

    await builder.updateTokenRedemptionAuth(activationTokenRedemptionAuthId, {
      activation_token_redemption_auth_status: status,
      activation_token_redemption_auth_result: result,
      redemption_auth_metadata_json: { rationale, decided_by: actorId, decided_at: new Date() }
    });

    await auditSvc.createAuditLog(activationTokenRedemptionAuthId, 'TOKEN_REDEMPTION_AUTH_DECISION_RECORDED', actorId, { decision, status, result });
    return { status, result };
  }

  async finalizeRedemptionAuth(activationTokenRedemptionAuthId, actorId) {
    const record = await builder.getTokenRedemptionAuth(activationTokenRedemptionAuthId);
    if (!record) throw new Error('TOKEN_REDEMPTION_AUTH_RECORD_NOT_FOUND');

    if (record.activation_token_redemption_auth_status !== 'AUTH_PASSED') {
      throw new Error('TOKEN_REDEMPTION_AUTH_NOT_PASSED');
    }

    const stringifiedForHash = record.activation_token_redemption_auth_id + '-' +
      record.source_activation_token_redemption_readiness_id + '-' +
      record.activation_token_redemption_auth_status + '-' +
      record.activation_token_redemption_auth_result;
    const authHash = 'ath_ath_' + crypto.createHash('sha256').update(stringifiedForHash).digest('hex');

    await builder.updateTokenRedemptionAuth(activationTokenRedemptionAuthId, {
      activation_token_redemption_auth_status: 'FINALIZED',
      activation_token_redemption_auth_hash: authHash,
      finalized_by: actorId,
      finalized_at: new Date()
    });

    const finalRecord = await builder.getTokenRedemptionAuth(activationTokenRedemptionAuthId);
    const evidence = await evidenceSvc.generateEvidencePack(finalRecord, actorId);

    // Bypass inmutable guard for post-FINALIZED evidence write
    await builder._internalUpdateTokenRedemptionAuth(activationTokenRedemptionAuthId, {
      token_redemption_auth_evidence_pack_hash: evidence.evidencePackHash,
      evidence_pack_hash: evidence.evidencePackHash,
      lineage_hash_chain_json: evidence.lineageHashChain
    });

    await auditSvc.createAuditLog(activationTokenRedemptionAuthId, 'TOKEN_REDEMPTION_AUTH_FINALIZED', actorId,
      { authHash, evidencePackHash: evidence.evidencePackHash });
    return await builder.getTokenRedemptionAuth(activationTokenRedemptionAuthId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationDecisionService()
};
