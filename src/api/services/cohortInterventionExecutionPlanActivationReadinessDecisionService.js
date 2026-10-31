'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationReadinessBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationReadinessAuditService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanActivationReadinessEvidencePackService').serviceInstance;

class CohortInterventionExecutionPlanActivationReadinessDecisionService {
  async recordDecision(activationRdId, result, rationale, actorId = 'system') {
    const record = await builder.getReadiness(activationRdId);
    if (!record) throw new Error('READINESS_RECORD_NOT_FOUND');

    if (record.activation_readiness_status === 'FINALIZED') {
      throw new Error('READINESS_RECORD_ALREADY_FINALIZED');
    }

    const allowedResults = [
      'ACTIVATION_READY_NOT_ACTIVE',
      'ACTIVATION_BLOCKED_BY_PARENT_PLAN',
      'ACTIVATION_BLOCKED_BY_GUARDRAIL',
      'ACTIVATION_BLOCKED_BY_EXECUTABLE_FLAG',
      'ACTIVATION_BLOCKED_BY_WRITE_SCOPE',
      'ACTIVATION_BLOCKED_BY_MISSING_KILL_SWITCH',
      'ACTIVATION_BLOCKED_BY_MISSING_ROLLBACK_AUTHORITY',
      'REQUIRE_PLAN_REMATERIALIZATION',
      'ESCALATE_TO_GOVERNANCE_OWNER'
    ];

    if (!allowedResults.includes(result)) {
      throw new Error('INVALID_READINESS_RESULT');
    }

    if (!rationale || rationale.trim().length < 5) {
      throw new Error('DECISION_RATIONALE_REQUIRED');
    }

    const updates = {
      activation_readiness_result: result,
      activation_readiness_status: 'READY_FOR_DECISION'
    };

    if (result === 'ACTIVATION_READY_NOT_ACTIVE') {
      updates.approved_by = actorId;
      updates.approved_at = new Date();
    } else {
      updates.rejected_by = actorId;
      updates.rejected_at = new Date();
    }

    const updated = await builder.updateReadiness(activationRdId, updates);
    await auditSvc.createAuditLog(activationRdId, 'READINESS_DECISION_RECORDED', actorId, { result, rationale });
    return { readiness: updated };
  }

  async finalizeReadiness(activationRdId, actorId = 'system') {
    const record = await builder.getReadiness(activationRdId);
    if (!record) throw new Error('READINESS_RECORD_NOT_FOUND');

    if (record.activation_readiness_status === 'FINALIZED') {
      throw new Error('READINESS_RECORD_ALREADY_FINALIZED');
    }

    // Must be evaluated
    if (record.activation_readiness_status === 'DRAFT') {
      throw new Error('READINESS_EVALUATION_NOT_COMPLETED');
    }

    // Must have a decision
    if (!record.activation_readiness_result) {
      throw new Error('READINESS_DECISION_REQUIRED');
    }

    // Build evidence pack if not done yet
    let evidence = await evidenceSvc.getEvidence(activationRdId);
    if (!evidence) {
      await evidenceSvc.buildEvidencePack(activationRdId, actorId);
      evidence = await evidenceSvc.getEvidence(activationRdId);
    }

    const updated = await builder.updateReadiness(activationRdId, {
      activation_readiness_status: 'FINALIZED',
      finalized_by: actorId,
      finalized_at: new Date()
    });

    await auditSvc.createAuditLog(activationRdId, 'READINESS_RECORD_FINALIZED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });
    return { readiness: updated };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationReadinessDecisionService();
module.exports = {
  CohortInterventionExecutionPlanActivationReadinessDecisionService,
  serviceInstance
};
