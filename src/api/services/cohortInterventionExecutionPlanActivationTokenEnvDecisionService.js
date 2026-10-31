'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenEnvBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenEnvAuditService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanActivationTokenEnvEvidencePackService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenEnvDecisionService {
  async recordDecision(activationTokenEnvId, result, rationale, actorId = 'system') {
    const record = await builder.getTokenEnv(activationTokenEnvId);
    if (!record) throw new Error('TOKEN_ENV_RECORD_NOT_FOUND');

    if (record.activation_token_env_status === 'FINALIZED') {
      throw new Error('TOKEN_ENV_RECORD_ALREADY_FINALIZED');
    }

    const allowedResults = [
      'ENVELOPE_PREPARED_NOT_ISSUED',
      'ENVELOPE_REJECTED_NOT_ISSUED',
      'ENVELOPE_BLOCKED_BY_PARENT_AUTH',
      'ENVELOPE_BLOCKED_BY_GUARDRAIL',
      'ENVELOPE_BLOCKED_BY_HASH_MISMATCH',
      'ENVELOPE_BLOCKED_BY_WRITE_SCOPE',
      'ENVELOPE_BLOCKED_BY_REDEEMABLE_TOKEN',
      'REQUIRE_AUTH_REVALIDATION',
      'ESCALATE_TO_SECURITY_COMMITTEE'
    ];

    if (!allowedResults.includes(result)) {
      throw new Error('INVALID_TOKEN_ENV_RESULT');
    }

    if (!rationale || rationale.trim().length < 5) {
      throw new Error('DECISION_RATIONALE_REQUIRED');
    }

    const updates = {
      activation_token_env_result: result,
      activation_token_env_status: 'READY_FOR_DECISION',
      envelope_rationale_json: { rationale, logged_by: actorId, logged_at: new Date() }
    };

    if (result === 'ENVELOPE_PREPARED_NOT_ISSUED') {
      updates.approved_by = actorId;
      updates.approved_at = new Date();
    } else {
      updates.rejected_by = actorId;
      updates.rejected_at = new Date();
    }

    const updated = await builder.updateTokenEnv(activationTokenEnvId, updates);
    await auditSvc.createAuditLog(activationTokenEnvId, 'TOKEN_ENV_RESULT_RECORDED', actorId, { result, rationale });
    return { tokenEnv: updated };
  }

  async finalizeTokenEnv(activationTokenEnvId, actorId = 'system') {
    const record = await builder.getTokenEnv(activationTokenEnvId);
    if (!record) throw new Error('TOKEN_ENV_RECORD_NOT_FOUND');

    if (record.activation_token_env_status === 'FINALIZED') {
      throw new Error('TOKEN_ENV_RECORD_ALREADY_FINALIZED');
    }

    if (record.activation_token_env_status === 'DRAFT') {
      throw new Error('TOKEN_ENV_EVALUATION_NOT_COMPLETED');
    }

    if (!record.activation_token_env_result) {
      throw new Error('TOKEN_ENV_RESULT_REQUIRED');
    }

    let evidence = await evidenceSvc.getEvidence(activationTokenEnvId);
    if (!evidence) {
      await evidenceSvc.buildEvidencePack(activationTokenEnvId, actorId);
      evidence = await evidenceSvc.getEvidence(activationTokenEnvId);
    }

    const updated = await builder.updateTokenEnv(activationTokenEnvId, {
      activation_token_env_status: 'FINALIZED',
      finalized_by: actorId,
      finalized_at: new Date()
    });

    await auditSvc.createAuditLog(activationTokenEnvId, 'TOKEN_ENV_RECORD_FINALIZED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });
    return { tokenEnv: updated };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationTokenEnvDecisionService();
module.exports = {
  CohortInterventionExecutionPlanActivationTokenEnvDecisionService,
  serviceInstance
};
