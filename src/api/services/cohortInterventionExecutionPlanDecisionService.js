'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanAuditService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanEvidencePackService').serviceInstance;

class CohortInterventionExecutionPlanDecisionService {
  async recordDecision(planId, result, rationale, actorId = 'system') {
    const record = await builder.getPlan(planId);
    if (!record) throw new Error('PLAN_RECORD_NOT_FOUND');

    if (record.plan_status === 'FINALIZED') {
      throw new Error('PLAN_RECORD_ALREADY_FINALIZED');
    }

    const allowedResults = [
      'PLAN_MATERIALIZED_NOT_EXECUTED',
      'PLAN_BLOCKED_BY_PARENT_DISPATCHER',
      'PLAN_BLOCKED_BY_GUARDRAIL',
      'PLAN_BLOCKED_BY_WRITE_SCOPE',
      'PLAN_BLOCKED_BY_EXECUTABLE_FLAG',
      'REQUIRE_DRY_RUN_REVALIDATION',
      'ESCALATE_TO_GOVERNANCE_OWNER'
    ];

    if (!allowedResults.includes(result)) {
      throw new Error('INVALID_PLAN_RESULT');
    }

    if (!rationale || rationale.trim().length < 5) {
      throw new Error('DECISION_RATIONALE_REQUIRED');
    }

    const updates = {
      plan_result: result,
      plan_status: 'READY_FOR_DECISION'
    };

    if (result === 'PLAN_MATERIALIZED_NOT_EXECUTED') {
      updates.approved_by = actorId;
      updates.approved_at = new Date();
    } else {
      updates.rejected_by = actorId;
      updates.rejected_at = new Date();
    }

    const updated = await builder.updatePlan(planId, updates);
    await auditSvc.createAuditLog(planId, 'PLAN_DECISION_RECORDED', actorId, { result, rationale });
    return { plan: updated };
  }

  async finalizePlan(planId, actorId = 'system') {
    const record = await builder.getPlan(planId);
    if (!record) throw new Error('PLAN_RECORD_NOT_FOUND');

    if (record.plan_status === 'FINALIZED') {
      throw new Error('PLAN_RECORD_ALREADY_FINALIZED');
    }

    // Must be evaluated
    if (record.plan_status === 'DRAFT') {
      throw new Error('PLAN_EVALUATION_NOT_COMPLETED');
    }

    // Must have a decision
    if (!record.plan_result) {
      throw new Error('PLAN_DECISION_REQUIRED');
    }

    // Build evidence pack if not done yet
    let evidence = await evidenceSvc.getEvidence(planId);
    if (!evidence) {
      await evidenceSvc.buildEvidencePack(planId, actorId);
      evidence = await evidenceSvc.getEvidence(planId);
    }

    const updated = await builder.updatePlan(planId, {
      plan_status: 'FINALIZED',
      finalized_by: actorId,
      finalized_at: new Date()
    });

    await auditSvc.createAuditLog(planId, 'PLAN_RECORD_FINALIZED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });
    return { plan: updated };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanDecisionService();
module.exports = {
  CohortInterventionExecutionPlanDecisionService,
  serviceInstance
};
