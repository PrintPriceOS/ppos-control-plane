'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionEnvelopeBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionEnvelopeAuditService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionEnvelopeEvidencePackService').serviceInstance;

class CohortInterventionExecutionEnvelopeDecisionService {
  async recordDecision(envelopeId, result, rationale, actorId = 'system') {
    const record = await builder.getEnvelope(envelopeId);
    if (!record) throw new Error('ENVELOPE_RECORD_NOT_FOUND');

    if (record.envelope_status === 'FINALIZED') {
      throw new Error('ENVELOPE_RECORD_ALREADY_FINALIZED');
    }

    const allowedResults = [
      'NO_OP_EXECUTED_NOT_MUTATED',
      'NO_OP_BLOCKED_BY_GUARDRAIL',
      'NO_OP_BLOCKED_BY_KILL_SWITCH',
      'NO_OP_BLOCKED_BY_CANARY_LIMITS',
      'NO_OP_BLOCKED_BY_AUTHORIZATION_STATE',
      'NO_OP_BLOCKED_BY_WRITE_SCOPE',
      'REQUIRE_RE_AUTHORIZATION',
      'ESCALATE_TO_GOVERNANCE_OWNER'
    ];

    if (!allowedResults.includes(result)) {
      throw new Error('INVALID_ENVELOPE_RESULT');
    }

    if (!rationale || rationale.trim().length < 5) {
      throw new Error('DECISION_RATIONALE_REQUIRED');
    }

    const updates = {
      envelope_result: result,
      envelope_status: 'READY_FOR_DECISION'
    };

    if (result === 'NO_OP_EXECUTED_NOT_MUTATED') {
      updates.approved_by = actorId;
      updates.approved_at = new Date();
    } else {
      updates.rejected_by = actorId;
      updates.rejected_at = new Date();
    }

    const updated = await builder.updateEnvelope(envelopeId, updates);
    await auditSvc.createAuditLog(envelopeId, 'ENVELOPE_DECISION_RECORDED', actorId, { result, rationale });
    return { envelope: updated };
  }

  async finalizeEnvelope(envelopeId, actorId = 'system') {
    const record = await builder.getEnvelope(envelopeId);
    if (!record) throw new Error('ENVELOPE_RECORD_NOT_FOUND');

    if (record.envelope_status === 'FINALIZED') {
      throw new Error('ENVELOPE_RECORD_ALREADY_FINALIZED');
    }

    // Must be evaluated
    if (record.envelope_status === 'DRAFT') {
      throw new Error('ENVELOPE_EVALUATION_NOT_COMPLETED');
    }

    // Must have a decision
    if (!record.envelope_result) {
      throw new Error('ENVELOPE_DECISION_REQUIRED');
    }

    // Build evidence pack if not done yet
    let evidence = await evidenceSvc.getEvidence(envelopeId);
    if (!evidence) {
      await evidenceSvc.buildEvidencePack(envelopeId, actorId);
      evidence = await evidenceSvc.getEvidence(envelopeId);
    }

    const updated = await builder.updateEnvelope(envelopeId, {
      envelope_status: 'FINALIZED',
      finalized_by: actorId,
      finalized_at: new Date()
    });

    await auditSvc.createAuditLog(envelopeId, 'ENVELOPE_RECORD_FINALIZED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });
    return { envelope: updated };
  }
}

const serviceInstance = new CohortInterventionExecutionEnvelopeDecisionService();
module.exports = {
  CohortInterventionExecutionEnvelopeDecisionService,
  serviceInstance
};
