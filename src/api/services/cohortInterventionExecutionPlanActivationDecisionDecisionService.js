'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationDecisionBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationDecisionAuditService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanActivationDecisionEvidencePackService').serviceInstance;

class CohortInterventionExecutionPlanActivationDecisionDecisionService {
  async recordDecision(activationDecisionId, result, rationale, actorId = 'system') {
    const record = await builder.getDecision(activationDecisionId);
    if (!record) throw new Error('DECISION_RECORD_NOT_FOUND');

    if (record.activation_decision_status === 'FINALIZED') {
      throw new Error('DECISION_RECORD_ALREADY_FINALIZED');
    }

    const allowedResults = [
      'GO_APPROVED_NOT_ACTIVE',
      'NO_GO_NOT_ACTIVE',
      'DECISION_BLOCKED_BY_PARENT_LOCK',
      'DECISION_BLOCKED_BY_GUARDRAIL',
      'DECISION_BLOCKED_BY_HASH_MISMATCH',
      'DECISION_BLOCKED_BY_WRITE_SCOPE',
      'DECISION_BLOCKED_BY_EXECUTABLE_FLAG',
      'REQUIRE_LOCK_REVALIDATION',
      'ESCALATE_TO_GOVERNANCE_OWNER'
    ];

    if (!allowedResults.includes(result)) {
      throw new Error('INVALID_DECISION_RESULT');
    }

    if (!rationale || rationale.trim().length < 5) {
      throw new Error('DECISION_RATIONALE_REQUIRED');
    }

    const updates = {
      activation_decision_result: result,
      activation_decision_status: 'READY_FOR_DECISION',
      decision_rationale_json: { rationale, logged_by: actorId, logged_at: new Date() }
    };

    if (result === 'GO_APPROVED_NOT_ACTIVE') {
      updates.approved_by = actorId;
      updates.approved_at = new Date();
    } else {
      updates.rejected_by = actorId;
      updates.rejected_at = new Date();
    }

    const updated = await builder.updateDecision(activationDecisionId, updates);
    await auditSvc.createAuditLog(activationDecisionId, 'DECISION_RESULT_RECORDED', actorId, { result, rationale });
    return { decision: updated };
  }

  async finalizeDecision(activationDecisionId, actorId = 'system') {
    const record = await builder.getDecision(activationDecisionId);
    if (!record) throw new Error('DECISION_RECORD_NOT_FOUND');

    if (record.activation_decision_status === 'FINALIZED') {
      throw new Error('DECISION_RECORD_ALREADY_FINALIZED');
    }

    // Must be evaluated
    if (record.activation_decision_status === 'DRAFT') {
      throw new Error('DECISION_EVALUATION_NOT_COMPLETED');
    }

    // Must have a decision
    if (!record.activation_decision_result) {
      throw new Error('DECISION_RESULT_REQUIRED');
    }

    // Build evidence pack if not done yet
    let evidence = await evidenceSvc.getEvidence(activationDecisionId);
    if (!evidence) {
      await evidenceSvc.buildEvidencePack(activationDecisionId, actorId);
      evidence = await evidenceSvc.getEvidence(activationDecisionId);
    }

    const updated = await builder.updateDecision(activationDecisionId, {
      activation_decision_status: 'FINALIZED',
      finalized_by: actorId,
      finalized_at: new Date()
    });

    await auditSvc.createAuditLog(activationDecisionId, 'DECISION_RECORD_FINALIZED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });
    return { decision: updated };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationDecisionDecisionService();
module.exports = {
  CohortInterventionExecutionPlanActivationDecisionDecisionService,
  serviceInstance
};
