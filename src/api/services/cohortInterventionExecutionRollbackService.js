'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builderService = require('./cohortInterventionExecutionBuilderService').serviceInstance || require('./cohortInterventionExecutionBuilderService');
const auditService = require('./cohortInterventionExecutionAuditService').serviceInstance || require('./cohortInterventionExecutionAuditService');

class CohortInterventionExecutionRollbackService {
  async createRollbackPlan(executionId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const exec = await builderService.getExecution(executionId);
    if (!exec) {
      throw new Error('EXECUTION_NOT_FOUND');
    }

    if (exec.execution_status === 'EXECUTED' || exec.execution_status === 'EXECUTION_IN_PROGRESS') {
      throw new Error('EXECUTION_ALREADY_IN_PROGRESS_OR_COMPLETED');
    }

    // Rollback is safe-scope ONLY (e.g. deactivate or mark the created marker/task as deleted/rolled back)
    const rollbackActions = [
      { action: 'DEACTIVATE_OR_REMOVE_SAFE_SCOPE_MARKER_OR_TASK', execution_id: executionId }
    ];

    const payload = {
      execution_id: executionId,
      cohort_id: exec.cohort_id,
      rollback_actions: rollbackActions,
      safety_guarantees: [
        'NO_EXTERNAL_REVERSAL_REQUIRED',
        'NO_FINANCIAL_OR_PAYMENT_REVERSAL_POSSIBLE'
      ]
    };

    const rollbackPlanId = 'rbp_' + crypto.randomBytes(8).toString('hex');

    // Update execution status, blockers, and steps
    const steps = await builderService.getSteps(executionId);
    const rollbackStep = steps.find(s => s.step_key === 'rollback_plan');
    if (rollbackStep) {
      rollbackStep.status = 'COMPLETED';
      rollbackStep.completed_at = new Date();
    }

    let blockers = {};
    if (typeof exec.execution_blockers_json === 'string') {
      blockers = JSON.parse(exec.execution_blockers_json);
    } else {
      blockers = exec.execution_blockers_json || {};
    }
    blockers.missing_rollback_plan = false;

    if (!isProdLike) {
      builderService._mockState.rollbackPlans.set(executionId, {
        rollback_plan_id: rollbackPlanId,
        execution_id: executionId,
        rollback_status: 'PENDING',
        rollback_payload_json: payload,
        created_at: new Date()
      });
      exec.execution_blockers_json = blockers;
      builderService._mockState.executions.set(executionId, exec);
      builderService._mockState.steps.set(executionId, steps);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_execution_rollback_plans
         (rollback_plan_id, execution_id, rollback_status, rollback_payload_json)
         VALUES (?, ?, ?, ?)`,
        [rollbackPlanId, executionId, 'PENDING', JSON.stringify(payload)]
      );

      await db.query(
        "UPDATE controlled_beta_cohort_intervention_execution_steps SET status = 'COMPLETED', completed_at = NOW() WHERE execution_id = ? AND step_key = 'rollback_plan'",
        [executionId]
      );

      await db.query(
        "UPDATE controlled_beta_cohort_intervention_executions SET execution_blockers_json = ? WHERE execution_id = ?",
        [JSON.stringify(blockers), executionId]
      );
    }

    await auditService.recordAuditEvent(executionId, 'ROLLBACK_PLAN_CREATED', actorId, { rollback_plan_id: rollbackPlanId });

    return {
      rollback_plan_id: rollbackPlanId,
      rollback_payload: payload
    };
  }

  async getRollbackPlan(executionId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return builderService._mockState.rollbackPlans.get(executionId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_execution_rollback_plans WHERE execution_id = ?", [executionId]);
      return list.length > 0 ? list[0] : null;
    }
  }

  async executeRollback(executionId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const exec = await builderService.getExecution(executionId);
    if (!exec) {
      throw new Error('EXECUTION_NOT_FOUND');
    }

    if (exec.execution_status !== 'EXECUTED') {
      throw new Error('CANNOT_ROLLBACK_UNEXECUTED_RECORD');
    }

    if (!isProdLike) {
      exec.execution_status = 'ROLLBACK_COMPLETED';
      builderService._mockState.executions.set(executionId, exec);
      const plan = builderService._mockState.rollbackPlans.get(executionId);
      if (plan) {
        plan.rollback_status = 'ROLLBACK_COMPLETED';
      }
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_executions SET execution_status = 'ROLLBACK_COMPLETED' WHERE execution_id = ?",
        [executionId]
      );
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_execution_rollback_plans SET rollback_status = 'ROLLBACK_COMPLETED' WHERE execution_id = ?",
        [executionId]
      );
    }

    await auditService.recordAuditEvent(executionId, 'ROLLBACK_EXECUTED', actorId);
    return { ok: true };
  }
}

const serviceInstance = new CohortInterventionExecutionRollbackService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionExecutionRollbackService = CohortInterventionExecutionRollbackService;
