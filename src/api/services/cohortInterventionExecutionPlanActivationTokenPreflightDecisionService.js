'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenPreflightBuilderService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanActivationTokenPreflightEvidencePackService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenPreflightAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenPreflightDecisionService {
  async recordDecision(activationTokenPreflightId, decision, rationale, actorId) {
    const record = await builder.getTokenPreflight(activationTokenPreflightId);
    if (!record) throw new Error('TOKEN_PREFLIGHT_RECORD_NOT_FOUND');

    if (record.activation_token_preflight_status !== 'EVALUATED') {
      throw new Error('TOKEN_PREFLIGHT_NOT_EVALUATED');
    }

    const isApproved = decision === 'APPROVE';
    const status = isApproved ? 'PREFLIGHT_PASSED' : 'PREFLIGHT_FAILED';
    const result = isApproved ? 'PREFLIGHT_PASSED_NOT_ISSUED' : 'PREFLIGHT_FAILED_NOT_ISSUED';

    await builder.updateTokenPreflight(activationTokenPreflightId, {
      activation_token_preflight_status: status,
      activation_token_preflight_result: result,
      preflight_metadata_json: { rationale, decided_by: actorId, decided_at: new Date() }
    });

    await auditSvc.createAuditLog(activationTokenPreflightId, 'TOKEN_PREFLIGHT_DECISION_RECORDED', actorId, { decision, status, result });
    return { status, result };
  }

  async finalizePreflight(activationTokenPreflightId, actorId) {
    const record = await builder.getTokenPreflight(activationTokenPreflightId);
    if (!record) throw new Error('TOKEN_PREFLIGHT_RECORD_NOT_FOUND');

    if (record.activation_token_preflight_status !== 'PREFLIGHT_PASSED') {
      throw new Error('TOKEN_PREFLIGHT_NOT_PASSED');
    }

    const stringifiedForHash = record.activation_token_preflight_id + '-' +
      record.source_activation_token_staging_id + '-' +
      record.activation_token_preflight_status + '-' +
      record.activation_token_preflight_result;
    const preflightHash = 'pfl_' + crypto.createHash('sha256').update(stringifiedForHash).digest('hex');

    await builder.updateTokenPreflight(activationTokenPreflightId, {
      activation_token_preflight_status: 'FINALIZED',
      activation_token_preflight_hash: preflightHash,
      finalized_by: actorId,
      finalized_at: new Date()
    });

    const finalRecord = await builder.getTokenPreflight(activationTokenPreflightId);
    const evidence = await evidenceSvc.generateEvidencePack(finalRecord, actorId);

    // Internal bypass: record is now FINALIZED, public updateTokenPreflight would reject this write
    await builder._internalUpdateTokenPreflight(activationTokenPreflightId, {
      token_preflight_evidence_pack_hash: evidence.evidencePackHash,
      evidence_pack_hash: evidence.evidencePackHash,
      lineage_hash_chain_json: evidence.lineageHashChain
    });

    await auditSvc.createAuditLog(activationTokenPreflightId, 'TOKEN_PREFLIGHT_FINALIZED', actorId,
      { preflightHash, evidencePackHash: evidence.evidencePackHash });
    return await builder.getTokenPreflight(activationTokenPreflightId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenPreflightDecisionService()
};
