'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService').serviceInstance;
const evaluator = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityEvaluatorService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityDecisionService {
  async recordDecision(unlockEligibilityId, decision, rationale, actorId) {
    if (!['APPROVE', 'REJECT'].includes(decision)) {
      throw new Error(`INVALID_DECISION: Decision must be APPROVE or REJECT.`);
    }

    const record = await builder.getTokenRedemptionUnlockEligibility(unlockEligibilityId);
    if (!record) throw new Error(`Unlock eligibility record ${unlockEligibilityId} not found`);

    if (record.unlock_eligibility_status === 'FINALIZED') {
      throw new Error(`LOCK_IMMUTABLE: Cannot record decision on finalized unlock eligibility record.`);
    }

    const rules = await evaluator.getLockRules(unlockEligibilityId);
    if (!rules || rules.length === 0) {
      throw new Error(`DECISION_BLOCKED: Rules must be evaluated before decision.`);
    }

    const hasCritical = rules.some(r => r.severity === 'CRITICAL');
    if (decision === 'APPROVE' && hasCritical) {
      throw new Error(`DECISION_BLOCKED: Cannot approve when critical rules have failed.`);
    }

    const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const result = decision === 'APPROVE' ? 'UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED' : 'UNLOCK_ELIGIBILITY_FAILED';

    const fields = {
      unlock_eligibility_status: status,
      unlock_eligibility_result: result,
      eligibility_rationale_json: { decision, rationale, decided_by: actorId, decided_at: new Date() }
    };

    await builder._internalUpdateUnlockEligibility(unlockEligibilityId, fields);
    await auditService.logAction(unlockEligibilityId, 'UNLOCK_ELIGIBILITY_DECISION_RECORDED', actorId, { decision, rationale });

    return builder.getTokenRedemptionUnlockEligibility(unlockEligibilityId);
  }

  async finalizeUnlockEligibility(unlockEligibilityId, actorId) {
    const record = await builder.getTokenRedemptionUnlockEligibility(unlockEligibilityId);
    if (!record) throw new Error(`Unlock eligibility record ${unlockEligibilityId} not found`);

    if (record.unlock_eligibility_status === 'FINALIZED') {
      throw new Error(`LOCK_IMMUTABLE: Cannot modify finalized unlock eligibility record.`);
    }

    if (record.unlock_eligibility_status !== 'APPROVED') {
      throw new Error(`FINALIZATION_BLOCKED: Record must be APPROVED before finalization. Current status: ${record.unlock_eligibility_status}`);
    }

    const finalHash = crypto.createHash('sha256').update(JSON.stringify(record) + Date.now().toString()).digest('hex');
    const fields = {
      unlock_eligibility_status: 'FINALIZED',
      unlock_eligibility_result: 'UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED',
      unlock_eligibility_hash: finalHash,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      token_redemption_lock_status: 'LOCKED_NOT_REDEEMED',
      token_redemption_status: 'LOCKED_NOT_REDEEMED',
      token_redeemable_status: 'NOT_REDEEMABLE',
      actual_unlock_status: 'NOT_UNLOCKED',
      activation_execution_status: 'UNLOCK_ELIGIBILITY_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      updated_by: actorId
    };

    await builder._internalUpdateUnlockEligibility(unlockEligibilityId, fields);
    await auditService.logAction(unlockEligibilityId, 'UNLOCK_ELIGIBILITY_FINALIZED', actorId, { finalHash });

    return builder.getTokenRedemptionUnlockEligibility(unlockEligibilityId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityDecisionService()
};
