'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService').serviceInstance;
const evaluator = require('./cohortInterventionExecutionPlanActivationTokenRedemptionLockEvaluatorService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionLockAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionLockDecisionService {
  async recordDecision(lockId, decision, rationale, actorId) {
    if (!['APPROVE', 'REJECT'].includes(decision)) {
      throw new Error(`INVALID_DECISION: Decision must be APPROVE or REJECT.`);
    }

    const record = await builder.getTokenRedemptionLock(lockId);
    if (!record) throw new Error(`Lock record ${lockId} not found`);

    if (record.activation_token_redemption_lock_status === 'FINALIZED') {
      throw new Error(`LOCK_IMMUTABLE: Cannot record decision on finalized lock record.`);
    }

    const rules = await evaluator.getLockRules(lockId);
    if (!rules || rules.length === 0) {
      throw new Error(`DECISION_BLOCKED: Rules must be evaluated before decision.`);
    }

    const hasCritical = rules.some(r => r.severity === 'CRITICAL');
    if (decision === 'APPROVE' && hasCritical) {
      throw new Error(`DECISION_BLOCKED: Cannot approve when critical rules have failed.`);
    }

    const lockStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const lockResult = decision === 'APPROVE' ? 'LOCKED_NOT_REDEEMED' : 'BLOCKED';

    const fields = {
      activation_token_redemption_lock_status: lockStatus,
      activation_token_redemption_lock_result: lockResult,
      token_redemption_lock_summary_json: { decision, rationale, decided_by: actorId, decided_at: new Date() }
    };

    await builder._internalUpdateTokenRedemptionLock(lockId, fields);
    await auditService.logAction(lockId, 'TOKEN_REDEMPTION_LOCK_DECISION_RECORDED', actorId, { decision, rationale });

    return builder.getTokenRedemptionLock(lockId);
  }

  async finalizeRedemptionLock(lockId, actorId) {
    const record = await builder.getTokenRedemptionLock(lockId);
    if (!record) throw new Error(`Lock record ${lockId} not found`);

    if (record.activation_token_redemption_lock_status === 'FINALIZED') {
      throw new Error(`LOCK_IMMUTABLE: Cannot modify finalized lock record.`);
    }

    if (record.activation_token_redemption_lock_status !== 'APPROVED') {
      throw new Error(`FINALIZATION_BLOCKED: Record must be APPROVED before finalization. Current status: ${record.activation_token_redemption_lock_status}`);
    }

    const finalHash = crypto.createHash('sha256').update(JSON.stringify(record) + Date.now().toString()).digest('hex');
    const fields = {
      activation_token_redemption_lock_status: 'FINALIZED',
      activation_token_redemption_lock_result: 'LOCKED_NOT_REDEEMED',
      activation_token_redemption_lock_hash: finalHash,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      token_status: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
      token_redemption_lock_status_val: 'LOCKED_NOT_REDEEMED',
      token_redemption_status: 'LOCKED_NOT_REDEEMED',
      token_redeemable_status: 'NOT_REDEEMABLE',
      activation_execution_status: 'TOKEN_REDEMPTION_LOCK_FINALIZED_NOT_REDEEMED_NOT_EXECUTED',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      updated_by: actorId
    };

    await builder._internalUpdateTokenRedemptionLock(lockId, fields);
    await auditService.logAction(lockId, 'TOKEN_REDEMPTION_LOCK_FINALIZED', actorId, { finalHash });

    return builder.getTokenRedemptionLock(lockId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionLockDecisionService()
};
