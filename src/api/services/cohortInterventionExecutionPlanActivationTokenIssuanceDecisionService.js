'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanActivationTokenIssuanceEvidencePackService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenIssuanceAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenIssuanceDecisionService {
  async recordDecision(activationTokenIssuanceId, decision, rationale, actorId) {
    const record = await builder.getTokenIssuance(activationTokenIssuanceId);
    if (!record) throw new Error('TOKEN_ISSUANCE_RECORD_NOT_FOUND');

    if (record.activation_token_issuance_status !== 'EVALUATED') {
      throw new Error('TOKEN_ISSUANCE_NOT_EVALUATED');
    }

    const isApproved = decision === 'APPROVE';
    const status = isApproved ? 'ISSUANCE_RECORDED' : 'ISSUANCE_REJECTED';
    const result = isApproved ? 'ISSUANCE_RECORDED_NOT_REDEEMABLE' : 'ISSUANCE_REJECTED_NOT_ISSUED';

    await builder.updateTokenIssuance(activationTokenIssuanceId, {
      activation_token_issuance_status: status,
      activation_token_issuance_result: result,
      issuance_metadata_json: { rationale, decided_by: actorId, decided_at: new Date() }
    });

    await auditSvc.createAuditLog(activationTokenIssuanceId, 'TOKEN_ISSUANCE_DECISION_RECORDED', actorId, { decision, status, result });
    return { status, result };
  }

  async finalizeIssuance(activationTokenIssuanceId, actorId) {
    const record = await builder.getTokenIssuance(activationTokenIssuanceId);
    if (!record) throw new Error('TOKEN_ISSUANCE_RECORD_NOT_FOUND');

    if (record.activation_token_issuance_status !== 'ISSUANCE_RECORDED') {
      throw new Error('TOKEN_ISSUANCE_NOT_RECORDED');
    }

    const stringifiedForHash = record.activation_token_issuance_id + '-' +
      record.source_activation_token_preflight_id + '-' +
      record.activation_token_issuance_status + '-' +
      record.activation_token_issuance_result;
    const issuanceHash = 'iss_' + crypto.createHash('sha256').update(stringifiedForHash).digest('hex');

    await builder.updateTokenIssuance(activationTokenIssuanceId, {
      activation_token_issuance_status: 'FINALIZED',
      activation_token_issuance_hash: issuanceHash,
      finalized_by: actorId,
      finalized_at: new Date()
    });

    const finalRecord = await builder.getTokenIssuance(activationTokenIssuanceId);
    const evidence = await evidenceSvc.generateEvidencePack(finalRecord, actorId);

    // Bypass inmutable guard for post-FINALIZED evidence write
    await builder._internalUpdateTokenIssuance(activationTokenIssuanceId, {
      token_issuance_evidence_pack_hash: evidence.evidencePackHash,
      evidence_pack_hash: evidence.evidencePackHash,
      lineage_hash_chain_json: evidence.lineageHashChain
    });

    await auditSvc.createAuditLog(activationTokenIssuanceId, 'TOKEN_ISSUANCE_FINALIZED', actorId,
      { issuanceHash, evidencePackHash: evidence.evidencePackHash });
    return await builder.getTokenIssuance(activationTokenIssuanceId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenIssuanceDecisionService()
};
