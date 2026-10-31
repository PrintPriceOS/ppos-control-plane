'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationHandoffBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationHandoffAuditService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanActivationHandoffEvidencePackService').serviceInstance;

class CohortInterventionExecutionPlanActivationHandoffDecisionService {
  async recordDecision(activationHandoffId, result, rationale, actorId = 'system') {
    const record = await builder.getHandoff(activationHandoffId);
    if (!record) throw new Error('HANDOFF_RECORD_NOT_FOUND');

    if (record.activation_handoff_status === 'FINALIZED') {
      throw new Error('HANDOFF_RECORD_ALREADY_FINALIZED');
    }

    const allowedResults = [
      'TOKEN_PREPARED_NOT_ISSUED',
      'TOKEN_BLOCKED_BY_PARENT_DECISION',
      'TOKEN_BLOCKED_BY_GUARDRAIL',
      'TOKEN_BLOCKED_BY_HASH_MISMATCH',
      'TOKEN_BLOCKED_BY_WRITE_SCOPE',
      'TOKEN_BLOCKED_BY_EXECUTABLE_FLAG',
      'REQUIRE_DECISION_REVALIDATION',
      'ESCALATE_TO_GOVERNANCE_OWNER'
    ];

    if (!allowedResults.includes(result)) {
      throw new Error('INVALID_HANDOFF_RESULT');
    }

    if (!rationale || rationale.trim().length < 5) {
      throw new Error('DECISION_RATIONALE_REQUIRED');
    }

    const updates = {
      activation_handoff_result: result,
      activation_handoff_status: 'READY_FOR_DECISION',
      handoff_rationale_json: { rationale, logged_by: actorId, logged_at: new Date() }
    };

    if (result === 'TOKEN_PREPARED_NOT_ISSUED') {
      updates.approved_by = actorId;
      updates.approved_at = new Date();
    } else {
      updates.rejected_by = actorId;
      updates.rejected_at = new Date();
    }

    const updated = await builder.updateHandoff(activationHandoffId, updates);
    await auditSvc.createAuditLog(activationHandoffId, 'HANDOFF_RESULT_RECORDED', actorId, { result, rationale });
    return { handoff: updated };
  }

  async finalizeHandoff(activationHandoffId, actorId = 'system') {
    const record = await builder.getHandoff(activationHandoffId);
    if (!record) throw new Error('HANDOFF_RECORD_NOT_FOUND');

    if (record.activation_handoff_status === 'FINALIZED') {
      throw new Error('HANDOFF_RECORD_ALREADY_FINALIZED');
    }

    // Must be evaluated
    if (record.activation_handoff_status === 'DRAFT') {
      throw new Error('HANDOFF_EVALUATION_NOT_COMPLETED');
    }

    // Must have a decision
    if (!record.activation_handoff_result) {
      throw new Error('HANDOFF_RESULT_REQUIRED');
    }

    // Build evidence pack if not done yet
    let evidence = await evidenceSvc.getEvidence(activationHandoffId);
    if (!evidence) {
      await evidenceSvc.buildEvidencePack(activationHandoffId, actorId);
      evidence = await evidenceSvc.getEvidence(activationHandoffId);
    }

    const updated = await builder.updateHandoff(activationHandoffId, {
      activation_handoff_status: 'FINALIZED',
      finalized_by: actorId,
      finalized_at: new Date()
    });

    await auditSvc.createAuditLog(activationHandoffId, 'HANDOFF_RECORD_FINALIZED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });
    return { handoff: updated };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationHandoffDecisionService();
module.exports = {
  CohortInterventionExecutionPlanActivationHandoffDecisionService,
  serviceInstance
};
