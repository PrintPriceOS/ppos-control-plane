'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenAuthBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenAuthAuditService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanActivationTokenAuthEvidencePackService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenAuthDecisionService {
  async recordDecision(activationTokenAuthId, result, rationale, actorId = 'system') {
    const record = await builder.getTokenAuth(activationTokenAuthId);
    if (!record) throw new Error('TOKEN_AUTH_RECORD_NOT_FOUND');

    if (record.activation_token_auth_status === 'FINALIZED') {
      throw new Error('TOKEN_AUTH_RECORD_ALREADY_FINALIZED');
    }

    const allowedResults = [
      'AUTHORIZED_NOT_ISSUED',
      'AUTHORIZATION_REJECTED_NOT_ISSUED',
      'AUTHORIZATION_BLOCKED_BY_PARENT_HANDOFF',
      'AUTHORIZATION_BLOCKED_BY_GUARDRAIL',
      'AUTHORIZATION_BLOCKED_BY_HASH_MISMATCH',
      'AUTHORIZATION_BLOCKED_BY_WRITE_SCOPE',
      'AUTHORIZATION_BLOCKED_BY_REDEEMABLE_TOKEN',
      'REQUIRE_HANDOFF_REVALIDATION',
      'ESCALATE_TO_GOVERNANCE_OWNER'
    ];

    if (!allowedResults.includes(result)) {
      throw new Error('INVALID_TOKEN_AUTH_RESULT');
    }

    if (!rationale || rationale.trim().length < 5) {
      throw new Error('DECISION_RATIONALE_REQUIRED');
    }

    const updates = {
      activation_token_auth_result: result,
      activation_token_auth_status: 'READY_FOR_DECISION',
      authorization_rationale_json: { rationale, logged_by: actorId, logged_at: new Date() }
    };

    if (result === 'AUTHORIZED_NOT_ISSUED') {
      updates.approved_by = actorId;
      updates.approved_at = new Date();
    } else {
      updates.rejected_by = actorId;
      updates.rejected_at = new Date();
    }

    const updated = await builder.updateTokenAuth(activationTokenAuthId, updates);
    await auditSvc.createAuditLog(activationTokenAuthId, 'TOKEN_AUTH_RESULT_RECORDED', actorId, { result, rationale });
    return { tokenAuth: updated };
  }

  async finalizeTokenAuth(activationTokenAuthId, actorId = 'system') {
    const record = await builder.getTokenAuth(activationTokenAuthId);
    if (!record) throw new Error('TOKEN_AUTH_RECORD_NOT_FOUND');

    if (record.activation_token_auth_status === 'FINALIZED') {
      throw new Error('TOKEN_AUTH_RECORD_ALREADY_FINALIZED');
    }

    if (record.activation_token_auth_status === 'DRAFT') {
      throw new Error('TOKEN_AUTH_EVALUATION_NOT_COMPLETED');
    }

    if (!record.activation_token_auth_result) {
      throw new Error('TOKEN_AUTH_RESULT_REQUIRED');
    }

    let evidence = await evidenceSvc.getEvidence(activationTokenAuthId);
    if (!evidence) {
      await evidenceSvc.buildEvidencePack(activationTokenAuthId, actorId);
      evidence = await evidenceSvc.getEvidence(activationTokenAuthId);
    }

    const updated = await builder.updateTokenAuth(activationTokenAuthId, {
      activation_token_auth_status: 'FINALIZED',
      finalized_by: actorId,
      finalized_at: new Date()
    });

    await auditSvc.createAuditLog(activationTokenAuthId, 'TOKEN_AUTH_RECORD_FINALIZED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });
    return { tokenAuth: updated };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationTokenAuthDecisionService();
module.exports = {
  CohortInterventionExecutionPlanActivationTokenAuthDecisionService,
  serviceInstance
};
