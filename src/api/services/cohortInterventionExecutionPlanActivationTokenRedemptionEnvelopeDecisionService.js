'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeBuilderService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeEvidencePackService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeDecisionService {
  async recordDecision(activationTokenRedemptionEnvelopeId, decision, rationale, actorId) {
    const record = await builder.getTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId);
    if (!record) throw new Error('TOKEN_REDEMPTION_ENVELOPE_RECORD_NOT_FOUND');

    if (record.activation_token_redemption_envelope_status !== 'EVALUATED') {
      throw new Error('TOKEN_REDEMPTION_ENVELOPE_NOT_EVALUATED');
    }

    const isApproved = decision === 'APPROVE';
    const status = isApproved ? 'ENVELOPE_PASSED' : 'ENVELOPE_FAILED';
    const result = isApproved ? 'REDEMPTION_ENVELOPE_PREPARED_NOT_REDEEMED' : 'REDEMPTION_ENVELOPE_FAILED';

    await builder.updateTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId, {
      activation_token_redemption_envelope_status: status,
      activation_token_redemption_envelope_result: result,
      redemption_envelope_metadata_json: { rationale, decided_by: actorId, decided_at: new Date() }
    });

    await auditSvc.createAuditLog(activationTokenRedemptionEnvelopeId, 'TOKEN_REDEMPTION_ENVELOPE_DECISION_RECORDED', actorId, { decision, status, result });
    return { status, result };
  }

  async finalizeRedemptionEnvelope(activationTokenRedemptionEnvelopeId, actorId) {
    const record = await builder.getTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId);
    if (!record) throw new Error('TOKEN_REDEMPTION_ENVELOPE_RECORD_NOT_FOUND');

    if (record.activation_token_redemption_envelope_status !== 'ENVELOPE_PASSED') {
      throw new Error('TOKEN_REDEMPTION_ENVELOPE_NOT_PASSED');
    }

    const stringifiedForHash = record.activation_token_redemption_env_id + '-' +
      record.source_activation_token_redemption_auth_id + '-' +
      record.activation_token_redemption_envelope_status + '-' +
      record.activation_token_redemption_envelope_result;
    const envelopeHash = 'env_hash_' + crypto.createHash('sha256').update(stringifiedForHash).digest('hex');

    await builder.updateTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId, {
      activation_token_redemption_envelope_status: 'FINALIZED',
      activation_token_redemption_envelope_hash: envelopeHash,
      finalized_by: actorId,
      finalized_at: new Date()
    });

    const finalRecord = await builder.getTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId);
    const evidence = await evidenceSvc.generateEvidencePack(finalRecord, actorId);

    // Bypass immutable lock for post-finalize evidence write
    await builder._internalUpdateTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId, {
      token_redemption_envelope_evidence_pack_hash: evidence.evidencePackHash,
      evidence_pack_hash: evidence.evidencePackHash,
      lineage_hash_chain_json: evidence.lineageHashChain
    });

    await auditSvc.createAuditLog(activationTokenRedemptionEnvelopeId, 'TOKEN_REDEMPTION_ENVELOPE_FINALIZED', actorId,
      { envelopeHash, evidencePackHash: evidence.evidencePackHash });
    return await builder.getTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeDecisionService()
};
