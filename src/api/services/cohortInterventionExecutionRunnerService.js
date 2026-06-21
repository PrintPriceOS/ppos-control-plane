'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builderService = require('./cohortInterventionExecutionBuilderService').serviceInstance || require('./cohortInterventionExecutionBuilderService');
const guardrailService = require('./cohortInterventionExecutionGuardrailService').serviceInstance || require('./cohortInterventionExecutionGuardrailService');
const dryRunService = require('./cohortInterventionExecutionDryRunService').serviceInstance || require('./cohortInterventionExecutionDryRunService');
const rollbackService = require('./cohortInterventionExecutionRollbackService').serviceInstance || require('./cohortInterventionExecutionRollbackService');
const auditService = require('./cohortInterventionExecutionAuditService').serviceInstance || require('./cohortInterventionExecutionAuditService');
const evidencePackService = require('./cohortInterventionExecutionEvidencePackService').serviceInstance || require('./cohortInterventionExecutionEvidencePackService');

class CohortInterventionExecutionRunnerService {
  async runExecution(executionId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const exec = await builderService.getExecution(executionId);
    if (!exec) {
      throw new Error('EXECUTION_NOT_FOUND');
    }

    // One-time-use validation: cannot run if already executed or rolled back
    if (exec.execution_status === 'EXECUTED' || exec.execution_status === 'ROLLBACK_COMPLETED' || exec.execution_status === 'EXECUTION_IN_PROGRESS') {
      throw new Error('EXECUTION_CANNOT_BE_RE_RUN_OR_CONSUMED');
    }

    const steps = await builderService.getSteps(executionId);

    // Guardrail validation
    const guardrailRes = await guardrailService.runGuardrailChecks(exec, steps);
    if (!guardrailRes.passed) {
      let blockers = {};
      if (typeof exec.execution_blockers_json === 'string') {
        blockers = JSON.parse(exec.execution_blockers_json);
      } else {
        blockers = exec.execution_blockers_json || {};
      }
      blockers.guardrail_failed = true;

      if (!isProdLike) {
        exec.execution_blockers_json = blockers;
        builderService._mockState.executions.set(executionId, exec);
      } else {
        await db.query(
          "UPDATE controlled_beta_cohort_intervention_executions SET execution_blockers_json = ? WHERE execution_id = ?",
          [JSON.stringify(blockers), executionId]
        );
      }
      throw new Error('EXECUTION_GUARDRAILS_FAILED');
    }

    // Mark as in progress
    if (!isProdLike) {
      exec.execution_status = 'EXECUTION_IN_PROGRESS';
      exec.started_at = new Date();
      builderService._mockState.executions.set(executionId, exec);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_executions SET execution_status = 'EXECUTION_IN_PROGRESS', started_at = NOW() WHERE execution_id = ?",
        [executionId]
      );
    }

    await auditService.recordAuditEvent(executionId, 'EXECUTION_STARTED', actorId);

    // Execute the safe-scope actions only
    const executedActions = [];
    if (exec.execution_type === 'EXECUTE_OBSERVATION_EXTENSION') {
      // Simulate/perform observation extension
      executedActions.push({ action: 'OBSERVATION_EXTENSION_MARKER_CREATED', timestamp: new Date().toISOString() });
    } else if (exec.execution_type === 'EXECUTE_PARTICIPANT_SUPPORT_TASKS') {
      executedActions.push({ action: 'PARTICIPANT_SUPPORT_TASK_CREATED', timestamp: new Date().toISOString() });
    } else if (exec.execution_type === 'EXECUTE_MANUAL_INTERVENTION_TASKS') {
      executedActions.push({ action: 'MANUAL_INTERVENTION_TASK_CREATED', timestamp: new Date().toISOString() });
    } else if (exec.execution_type === 'EXECUTE_COHORT_CONTINUATION_MARKER') {
      executedActions.push({ action: 'COHORT_CONTINUATION_MARKER_CREATED', timestamp: new Date().toISOString() });
    } else if (exec.execution_type === 'EXECUTE_RISK_ESCALATION_MARKER') {
      executedActions.push({ action: 'RISK_ESCALATION_MARKER_CREATED', timestamp: new Date().toISOString() });
    } else {
      throw new Error('FORBIDDEN_EXECUTION_TYPE');
    }

    const resultPayload = {
      execution_id: executionId,
      execution_type: exec.execution_type,
      cohort_id: exec.cohort_id,
      executed_actions: executedActions,
      safety_attestation: exec.safe_scope_attestation_json
    };

    const resultId = 'res_' + crypto.randomBytes(8).toString('hex');
    const resultHash = crypto.createHash('sha256').update(JSON.stringify(resultPayload)).digest('hex');

    // Update execution results
    if (!isProdLike) {
      builderService._mockState.results.set(executionId, {
        result_id: resultId,
        execution_id: executionId,
        result_status: 'SUCCESS',
        result_payload_json: resultPayload,
        execution_result_hash: resultHash,
        created_at: new Date()
      });
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_execution_results
         (result_id, execution_id, result_status, result_payload_json, execution_result_hash)
         VALUES (?, ?, ?, ?, ?)`,
        [resultId, executionId, 'SUCCESS', JSON.stringify(resultPayload), resultHash]
      );
    }

    // Generate evidence pack version 140.0
    const dryRun = await dryRunService.getDryRun(executionId);
    const rollbackPlan = await rollbackService.getRollbackPlan(executionId);

    const evidence = await evidencePackService.buildEvidencePack(
      executionId,
      exec,
      steps,
      dryRun,
      rollbackPlan,
      resultPayload,
      guardrailRes
    );

    // Finalize execution
    if (!isProdLike) {
      exec.execution_status = 'EXECUTED';
      exec.finished_at = new Date();
      exec.evidence_pack_hash = evidence.evidence_pack_hash;
      builderService._mockState.executions.set(executionId, exec);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_executions SET execution_status = 'EXECUTED', finished_at = NOW(), evidence_pack_hash = ? WHERE execution_id = ?",
        [evidence.evidence_pack_hash, executionId]
      );
    }

    await auditService.recordAuditEvent(executionId, 'EXECUTION_COMPLETED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });

    return {
      execution_status: 'EXECUTED',
      result_status: 'SUCCESS',
      evidence_pack_hash: evidence.evidence_pack_hash
    };
  }
}

const serviceInstance = new CohortInterventionExecutionRunnerService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionExecutionRunnerService = CohortInterventionExecutionRunnerService;
