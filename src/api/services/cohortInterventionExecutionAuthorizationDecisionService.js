'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionAuthorizationBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionAuthorizationAuditService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionAuthorizationEvidencePackService').serviceInstance;

class CohortInterventionExecutionAuthorizationDecisionService {
  async recordDecision(authId, decision, rationale, actorId = 'system') {
    const record = await builder.getAuth(authId);
    if (!record) throw new Error('AUTHORIZATION_RECORD_NOT_FOUND');

    if (record.auth_status === 'FINALIZED') {
      throw new Error('AUTHORIZATION_RECORD_ALREADY_FINALIZED');
    }

    const allowedDecisions = [
      'AUTHORIZE_CONTROLLED_EXECUTION_NOT_ACTIVE',
      'REJECT_CONTROLLED_EXECUTION_AUTHORIZATION',
      'BLOCK_EXECUTION_PATH',
      'REQUIRE_OPERATOR_RECONFIRMATION',
      'REQUIRE_KILL_SWITCH_REVIEW',
      'REQUIRE_CANARY_ENVELOPE_REVIEW',
      'REQUIRE_RATE_LIMIT_REVIEW',
      'REQUIRE_READINESS_REVALIDATION',
      'ESCALATE_TO_GOVERNANCE_OWNER'
    ];

    if (!allowedDecisions.includes(decision)) {
      throw new Error('INVALID_AUTHORIZATION_DECISION');
    }

    if (!rationale || rationale.trim().length < 5) {
      throw new Error('DECISION_RATIONALE_REQUIRED');
    }

    const updates = {
      auth_decision: decision,
      auth_status: 'READY_FOR_DECISION'
    };

    if (decision === 'AUTHORIZE_CONTROLLED_EXECUTION_NOT_ACTIVE') {
      updates.approved_by = actorId;
      updates.approved_at = new Date();
      updates.auth_execution_status = 'AUTHORIZATION_APPROVED_NOT_EXECUTED';
    } else {
      updates.rejected_by = actorId;
      updates.rejected_at = new Date();
      updates.auth_execution_status = 'AUTHORIZATION_REJECTED_NOT_EXECUTED';
    }

    const updated = await builder.updateAuth(authId, updates);
    await auditSvc.createAuditLog(authId, 'AUTHORIZATION_DECISION_RECORDED', actorId, { decision, rationale });
    return { auth: updated };
  }

  async finalizeAuth(authId, actorId = 'system') {
    const record = await builder.getAuth(authId);
    if (!record) throw new Error('AUTHORIZATION_RECORD_NOT_FOUND');

    if (record.auth_status === 'FINALIZED') {
      throw new Error('AUTHORIZATION_RECORD_ALREADY_FINALIZED');
    }

    // Must be evaluated
    if (record.auth_status === 'DRAFT') {
      throw new Error('AUTHORIZATION_EVALUATION_NOT_COMPLETED');
    }

    // Must have a decision
    if (!record.auth_decision) {
      throw new Error('AUTHORIZATION_DECISION_REQUIRED');
    }

    // Build evidence pack if not done yet
    let evidence = await evidenceSvc.getEvidence(authId);
    if (!evidence) {
      await evidenceSvc.buildEvidencePack(authId, actorId);
      evidence = await evidenceSvc.getEvidence(authId);
    }

    const updated = await builder.updateAuth(authId, {
      auth_status: 'FINALIZED',
      finalized_by: actorId,
      finalized_at: new Date()
    });

    await auditSvc.createAuditLog(authId, 'AUTHORIZATION_RECORD_FINALIZED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });
    return { auth: updated };
  }
}

const serviceInstance = new CohortInterventionExecutionAuthorizationDecisionService();
module.exports = {
  CohortInterventionExecutionAuthorizationDecisionService,
  serviceInstance
};
