'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenStagingBuilderService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanActivationTokenStagingEvidencePackService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenStagingAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenStagingDecisionService {
  async recordDecision(activationTokenStagingId, decision, rationale, actorId) {
    const record = await builder.getTokenStaging(activationTokenStagingId);
    if (!record) throw new Error('TOKEN_STAGING_RECORD_NOT_FOUND');

    if (record.activation_token_staging_status !== 'EVALUATED') {
      throw new Error('TOKEN_STAGING_NOT_EVALUATED');
    }

    const isApproved = decision === 'APPROVE';
    const status = isApproved ? 'STAGED' : 'REJECTED';
    const result = isApproved ? 'STAGED_NOT_ISSUED' : 'STAGING_REJECTED_NOT_ISSUED';

    await builder.updateTokenStaging(activationTokenStagingId, {
      activation_token_staging_status: status,
      activation_token_staging_result: result,
      staging_metadata_json: { rationale, decided_by: actorId, decided_at: new Date() }
    });

    await auditSvc.createAuditLog(activationTokenStagingId, 'TOKEN_STAGING_DECISION_RECORDED', actorId, { decision, status, result });
    return { status, result };
  }

  async finalizeStaging(activationTokenStagingId, actorId) {
    const record = await builder.getTokenStaging(activationTokenStagingId);
    if (!record) throw new Error('TOKEN_STAGING_RECORD_NOT_FOUND');

    if (record.activation_token_staging_status !== 'STAGED') {
      throw new Error('TOKEN_STAGING_NOT_STAGED');
    }

    const stringifiedForHash = record.activation_token_staging_id + '-' + record.source_activation_token_final_apv_id + '-' + record.activation_token_staging_status + '-' + record.activation_token_staging_result;
    const stagingHash = 'stg_' + crypto.createHash('sha256').update(stringifiedForHash).digest('hex');

    await builder.updateTokenStaging(activationTokenStagingId, {
      activation_token_staging_status: 'FINALIZED',
      activation_token_staging_hash: stagingHash,
      finalized_by: actorId,
      finalized_at: new Date()
    });

    const finalRecord = await builder.getTokenStaging(activationTokenStagingId);
    const evidence = await evidenceSvc.generateEvidencePack(finalRecord, actorId);

    // Use internal bypass: record is now FINALIZED, public updateTokenStaging would reject this write
    await builder._internalUpdateTokenStaging(activationTokenStagingId, {
      token_staging_evidence_pack_hash: evidence.evidencePackHash,
      evidence_pack_hash: evidence.evidencePackHash,
      lineage_hash_chain_json: evidence.lineageHashChain
    });

    await auditSvc.createAuditLog(activationTokenStagingId, 'TOKEN_STAGING_FINALIZED', actorId, { stagingHash, evidencePackHash: evidence.evidencePackHash });
    return await builder.getTokenStaging(activationTokenStagingId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenStagingDecisionService()
};
