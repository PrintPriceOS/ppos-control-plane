'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionReadinessBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionReadinessAuditService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionReadinessEvidencePackService').serviceInstance;

class CohortInterventionExecutionReadinessDecisionService {
  async recordDecision(readinessId, decision, rationale, actorId = 'system') {
    const record = await builder.getReadiness(readinessId);
    if (!record) throw new Error('READINESS_RECORD_NOT_FOUND');

    if (record.readiness_status === 'FINALIZED') {
      throw new Error('READINESS_RECORD_ALREADY_FINALIZED');
    }

    const allowedDecisions = [
      'APPROVE_EXECUTION_READINESS_NOT_EXECUTED',
      'REJECT_EXECUTION_READINESS',
      'BLOCK_EXECUTION_PATH',
      'REQUIRE_ROLLBACK_REVIEW',
      'REQUIRE_KILL_SWITCH_REVIEW',
      'REQUIRE_RATE_LIMIT_REVIEW',
      'REQUIRE_RE_APPROVAL',
      'ESCALATE_TO_GOVERNANCE_OWNER'
    ];

    if (!allowedDecisions.includes(decision)) {
      throw new Error('INVALID_READINESS_DECISION');
    }

    if (!rationale || rationale.trim().length < 5) {
      throw new Error('DECISION_RATIONALE_REQUIRED');
    }

    const updates = {
      readiness_decision: decision,
      readiness_status: 'READY_FOR_DECISION'
    };

    if (decision === 'APPROVE_EXECUTION_READINESS_NOT_EXECUTED') {
      updates.approved_by = actorId;
      updates.approved_at = new Date();
      updates.readiness_execution_status = 'READINESS_APPROVED_NOT_EXECUTED';
    } else {
      updates.rejected_by = actorId;
      updates.rejected_at = new Date();
      updates.readiness_execution_status = 'READINESS_REJECTED_NOT_EXECUTED';
    }

    const updated = await builder.updateReadiness(readinessId, updates);
    await auditSvc.createAuditLog(readinessId, 'READINESS_DECISION_RECORDED', actorId, { decision, rationale });
    return { readiness: updated };
  }

  async finalizeReadiness(readinessId, actorId = 'system') {
    const record = await builder.getReadiness(readinessId);
    if (!record) throw new Error('READINESS_RECORD_NOT_FOUND');

    if (record.readiness_status === 'FINALIZED') {
      throw new Error('READINESS_RECORD_ALREADY_FINALIZED');
    }

    // Must be evaluated
    if (record.readiness_status === 'DRAFT') {
      throw new Error('READINESS_EVALUATION_NOT_COMPLETED');
    }

    // Must have a decision
    if (!record.readiness_decision) {
      throw new Error('READINESS_DECISION_REQUIRED');
    }

    // Build evidence pack if not done yet
    let evidence = await evidenceSvc.getEvidence(readinessId);
    if (!evidence) {
      await evidenceSvc.buildEvidencePack(readinessId, actorId);
      evidence = await evidenceSvc.getEvidence(readinessId);
    }

    const updated = await builder.updateReadiness(readinessId, {
      readiness_status: 'FINALIZED',
      finalized_by: actorId,
      finalized_at: new Date()
    });

    await auditSvc.createAuditLog(readinessId, 'READINESS_RECORD_FINALIZED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });
    return { readiness: updated };
  }
}

const serviceInstance = new CohortInterventionExecutionReadinessDecisionService();
module.exports = {
  CohortInterventionExecutionReadinessDecisionService,
  serviceInstance
};
