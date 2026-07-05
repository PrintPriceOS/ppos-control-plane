'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationLockBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationLockAuditService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanActivationLockEvidencePackService').serviceInstance;

class CohortInterventionExecutionPlanActivationLockDecisionService {
  async recordDecision(activationLockId, result, rationale, actorId = 'system') {
    const record = await builder.getLock(activationLockId);
    if (!record) throw new Error('LOCK_RECORD_NOT_FOUND');

    if (record.activation_lock_status === 'FINALIZED') {
      throw new Error('LOCK_RECORD_ALREADY_FINALIZED');
    }

    const allowedResults = [
      'LOCKED_NOT_ACTIVE',
      'FREEZE_CONFIRMED_NOT_ACTIVE',
      'LOCK_BLOCKED_BY_PARENT_AUTHORIZATION',
      'LOCK_BLOCKED_BY_GUARDRAIL',
      'LOCK_BLOCKED_BY_HASH_MISMATCH',
      'LOCK_BLOCKED_BY_WRITE_SCOPE',
      'LOCK_BLOCKED_BY_EXECUTABLE_FLAG',
      'REQUIRE_AUTHORIZATION_REVALIDATION',
      'ESCALATE_TO_GOVERNANCE_OWNER'
    ];

    if (!allowedResults.includes(result)) {
      throw new Error('INVALID_LOCK_RESULT');
    }

    if (!rationale || rationale.trim().length < 5) {
      throw new Error('DECISION_RATIONALE_REQUIRED');
    }

    const updates = {
      activation_lock_result: result,
      activation_lock_status: 'READY_FOR_DECISION'
    };

    if (result === 'LOCKED_NOT_ACTIVE' || result === 'FREEZE_CONFIRMED_NOT_ACTIVE') {
      updates.approved_by = actorId;
      updates.approved_at = new Date();
    } else {
      updates.rejected_by = actorId;
      updates.rejected_at = new Date();
    }

    const updated = await builder.updateLock(activationLockId, updates);
    await auditSvc.createAuditLog(activationLockId, 'LOCK_DECISION_RECORDED', actorId, { result, rationale });
    return { lock: updated };
  }

  async finalizeLock(activationLockId, actorId = 'system') {
    const record = await builder.getLock(activationLockId);
    if (!record) throw new Error('LOCK_RECORD_NOT_FOUND');

    if (record.activation_lock_status === 'FINALIZED') {
      throw new Error('LOCK_RECORD_ALREADY_FINALIZED');
    }

    // Must be evaluated
    if (record.activation_lock_status === 'DRAFT') {
      throw new Error('LOCK_EVALUATION_NOT_COMPLETED');
    }

    // Must have a decision
    if (!record.activation_lock_result) {
      throw new Error('LOCK_DECISION_REQUIRED');
    }

    // Build evidence pack if not done yet
    let evidence = await evidenceSvc.getEvidence(activationLockId);
    if (!evidence) {
      await evidenceSvc.buildEvidencePack(activationLockId, actorId);
      evidence = await evidenceSvc.getEvidence(activationLockId);
    }

    const updated = await builder.updateLock(activationLockId, {
      activation_lock_status: 'FINALIZED',
      finalized_by: actorId,
      finalized_at: new Date()
    });

    await auditSvc.createAuditLog(activationLockId, 'LOCK_RECORD_FINALIZED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });
    return { lock: updated };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationLockDecisionService();
module.exports = {
  CohortInterventionExecutionPlanActivationLockDecisionService,
  serviceInstance
};
