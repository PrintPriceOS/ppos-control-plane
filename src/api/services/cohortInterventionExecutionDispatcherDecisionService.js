'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionDispatcherBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionDispatcherAuditService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionDispatcherEvidencePackService').serviceInstance;

class CohortInterventionExecutionDispatcherDecisionService {
  async recordDecision(dispatcherId, result, rationale, actorId = 'system') {
    const record = await builder.getDispatcher(dispatcherId);
    if (!record) throw new Error('DISPATCHER_RECORD_NOT_FOUND');

    if (record.dispatcher_status === 'FINALIZED') {
      throw new Error('DISPATCHER_RECORD_ALREADY_FINALIZED');
    }

    const allowedResults = [
      'DRY_RUN_EXECUTED_NOT_MUTATED',
      'DRY_RUN_BLOCKED_BY_GUARDRAIL',
      'DRY_RUN_BLOCKED_BY_PARENT_ENVELOPE',
      'DRY_RUN_BLOCKED_BY_QUEUE_POLICY',
      'DRY_RUN_BLOCKED_BY_ROLLBACK_POLICY',
      'DRY_RUN_BLOCKED_BY_WRITE_SCOPE',
      'REQUIRE_NO_OP_REVALIDATION',
      'ESCALATE_TO_GOVERNANCE_OWNER'
    ];

    if (!allowedResults.includes(result)) {
      throw new Error('INVALID_DISPATCHER_RESULT');
    }

    if (!rationale || rationale.trim().length < 5) {
      throw new Error('DECISION_RATIONALE_REQUIRED');
    }

    const updates = {
      dispatcher_result: result,
      dispatcher_status: 'READY_FOR_DECISION'
    };

    if (result === 'DRY_RUN_EXECUTED_NOT_MUTATED') {
      updates.approved_by = actorId;
      updates.approved_at = new Date();
    } else {
      updates.rejected_by = actorId;
      updates.rejected_at = new Date();
    }

    const updated = await builder.updateDispatcher(dispatcherId, updates);
    await auditSvc.createAuditLog(dispatcherId, 'DISPATCHER_DECISION_RECORDED', actorId, { result, rationale });
    return { dispatcher: updated };
  }

  async finalizeDispatcher(dispatcherId, actorId = 'system') {
    const record = await builder.getDispatcher(dispatcherId);
    if (!record) throw new Error('DISPATCHER_RECORD_NOT_FOUND');

    if (record.dispatcher_status === 'FINALIZED') {
      throw new Error('DISPATCHER_RECORD_ALREADY_FINALIZED');
    }

    // Must be evaluated
    if (record.dispatcher_status === 'DRAFT') {
      throw new Error('DISPATCHER_EVALUATION_NOT_COMPLETED');
    }

    // Must have a decision
    if (!record.dispatcher_result) {
      throw new Error('DISPATCHER_DECISION_REQUIRED');
    }

    // Build evidence pack if not done yet
    let evidence = await evidenceSvc.getEvidence(dispatcherId);
    if (!evidence) {
      await evidenceSvc.buildEvidencePack(dispatcherId, actorId);
      evidence = await evidenceSvc.getEvidence(dispatcherId);
    }

    const updated = await builder.updateDispatcher(dispatcherId, {
      dispatcher_status: 'FINALIZED',
      finalized_by: actorId,
      finalized_at: new Date()
    });

    await auditSvc.createAuditLog(dispatcherId, 'DISPATCHER_RECORD_FINALIZED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });
    return { dispatcher: updated };
  }
}

const serviceInstance = new CohortInterventionExecutionDispatcherDecisionService();
module.exports = {
  CohortInterventionExecutionDispatcherDecisionService,
  serviceInstance
};
