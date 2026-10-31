'use strict';

const db = require('./mysqlClient');
const builderService = require('./cohortInterventionExecutionBuilderService').serviceInstance || require('./cohortInterventionExecutionBuilderService');
const auditService = require('./cohortInterventionExecutionAuditService').serviceInstance || require('./cohortInterventionExecutionAuditService');

class CohortInterventionExecutionOperatorConfirmationService {
  async confirmExecution(executionId, actorId, signature, phrase) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (phrase !== 'CONFIRM_PHASE_140_CONTROLLED_EXECUTION') {
      throw new Error('INVALID_CONFIRMATION_PHRASE');
    }

    if (!signature || signature.trim() === '') {
      throw new Error('SIGNATURE_REQUIRED');
    }

    const exec = await builderService.getExecution(executionId);
    if (!exec) {
      throw new Error('EXECUTION_NOT_FOUND');
    }

    if (exec.execution_status === 'EXECUTED' || exec.execution_status === 'EXECUTION_IN_PROGRESS') {
      throw new Error('EXECUTION_ALREADY_IN_PROGRESS_OR_COMPLETED');
    }

    // Step verification
    const steps = await builderService.getSteps(executionId);
    const confirmationStep = steps.find(s => s.step_key === 'operator_confirmation');
    if (confirmationStep) {
      confirmationStep.status = 'COMPLETED';
      confirmationStep.completed_at = new Date();
    }

    let blockers = {};
    if (typeof exec.execution_blockers_json === 'string') {
      blockers = JSON.parse(exec.execution_blockers_json);
    } else {
      blockers = exec.execution_blockers_json || {};
    }
    blockers.missing_operator_confirmation = false;

    if (!isProdLike) {
      exec.operator_confirmed = true;
      exec.operator_confirmed_by = actorId;
      exec.operator_confirmed_at = new Date();
      exec.operator_confirmation_phrase = phrase;
      exec.operator_confirmation_signature = signature;
      exec.execution_blockers_json = blockers;
      exec.execution_status = 'CONFIRMED_FOR_EXECUTION';
      builderService._mockState.executions.set(executionId, exec);
      builderService._mockState.steps.set(executionId, steps);
    } else {
      await db.query(
        `UPDATE controlled_beta_cohort_intervention_executions
         SET operator_confirmed = TRUE, operator_confirmed_by = ?, operator_confirmed_at = NOW(),
             operator_confirmation_phrase = ?, operator_confirmation_signature = ?, execution_blockers_json = ?,
             execution_status = 'CONFIRMED_FOR_EXECUTION'
         WHERE execution_id = ?`,
        [actorId, phrase, signature, JSON.stringify(blockers), executionId]
      );

      await db.query(
        "UPDATE controlled_beta_cohort_intervention_execution_steps SET status = 'COMPLETED', completed_at = NOW() WHERE execution_id = ? AND step_key = 'operator_confirmation'",
        [executionId]
      );
    }

    await auditService.recordAuditEvent(executionId, 'OPERATOR_CONFIRMED', actorId, { signature });
    return { ok: true };
  }
}

const serviceInstance = new CohortInterventionExecutionOperatorConfirmationService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionExecutionOperatorConfirmationService = CohortInterventionExecutionOperatorConfirmationService;
