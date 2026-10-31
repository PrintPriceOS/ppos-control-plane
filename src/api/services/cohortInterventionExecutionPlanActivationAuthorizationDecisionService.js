'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationAuthorizationBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationAuthorizationAuditService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanActivationAuthorizationEvidencePackService').serviceInstance;

class CohortInterventionExecutionPlanActivationAuthorizationDecisionService {
  async recordDecision(activationAuthId, result, rationale, actorId = 'system') {
    const record = await builder.getAuthorization(activationAuthId);
    if (!record) throw new Error('AUTHORIZATION_RECORD_NOT_FOUND');

    if (record.activation_auth_status === 'FINALIZED') {
      throw new Error('AUTHORIZATION_RECORD_ALREADY_FINALIZED');
    }

    const allowedResults = [
      'AUTHORIZED_NOT_ACTIVE',
      'AUTHORIZATION_REJECTED_NOT_ACTIVE',
      'AUTHORIZATION_BLOCKED_BY_PARENT_READINESS',
      'AUTHORIZATION_BLOCKED_BY_GUARDRAIL',
      'AUTHORIZATION_BLOCKED_BY_EXECUTABLE_FLAG',
      'AUTHORIZATION_BLOCKED_BY_WRITE_SCOPE',
      'REQUIRE_ACTIVATION_READINESS_REVALIDATION',
      'ESCALATE_TO_GOVERNANCE_OWNER'
    ];

    if (!allowedResults.includes(result)) {
      throw new Error('INVALID_AUTHORIZATION_RESULT');
    }

    if (!rationale || rationale.trim().length < 5) {
      throw new Error('DECISION_RATIONALE_REQUIRED');
    }

    const updates = {
      activation_auth_result: result,
      activation_auth_status: 'READY_FOR_DECISION'
    };

    if (result === 'AUTHORIZED_NOT_ACTIVE') {
      updates.approved_by = actorId;
      updates.approved_at = new Date();
    } else {
      updates.rejected_by = actorId;
      updates.rejected_at = new Date();
    }

    const updated = await builder.updateAuthorization(activationAuthId, updates);
    await auditSvc.createAuditLog(activationAuthId, 'AUTHORIZATION_DECISION_RECORDED', actorId, { result, rationale });
    return { authorization: updated };
  }

  async finalizeAuthorization(activationAuthId, actorId = 'system') {
    const record = await builder.getAuthorization(activationAuthId);
    if (!record) throw new Error('AUTHORIZATION_RECORD_NOT_FOUND');

    if (record.activation_auth_status === 'FINALIZED') {
      throw new Error('AUTHORIZATION_RECORD_ALREADY_FINALIZED');
    }

    // Must be evaluated
    if (record.activation_auth_status === 'DRAFT') {
      throw new Error('AUTHORIZATION_EVALUATION_NOT_COMPLETED');
    }

    // Must have a decision
    if (!record.activation_auth_result) {
      throw new Error('AUTHORIZATION_DECISION_REQUIRED');
    }

    // Build evidence pack if not done yet
    let evidence = await evidenceSvc.getEvidence(activationAuthId);
    if (!evidence) {
      await evidenceSvc.buildEvidencePack(activationAuthId, actorId);
      evidence = await evidenceSvc.getEvidence(activationAuthId);
    }

    const updated = await builder.updateAuthorization(activationAuthId, {
      activation_auth_status: 'FINALIZED',
      finalized_by: actorId,
      finalized_at: new Date()
    });

    await auditSvc.createAuditLog(activationAuthId, 'AUTHORIZATION_RECORD_FINALIZED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });
    return { authorization: updated };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationAuthorizationDecisionService();
module.exports = {
  CohortInterventionExecutionPlanActivationAuthorizationDecisionService,
  serviceInstance
};
