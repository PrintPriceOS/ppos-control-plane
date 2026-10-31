'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builderService = require('./cohortInterventionExecutionBuilderService').serviceInstance || require('./cohortInterventionExecutionBuilderService');
const auditService = require('./cohortInterventionExecutionAuditService').serviceInstance || require('./cohortInterventionExecutionAuditService');

class CohortInterventionExecutionDryRunService {
  async generateDryRun(executionId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const exec = await builderService.getExecution(executionId);
    if (!exec) {
      throw new Error('EXECUTION_NOT_FOUND');
    }

    if (exec.execution_status === 'EXECUTED' || exec.execution_status === 'EXECUTION_IN_PROGRESS') {
      throw new Error('EXECUTION_ALREADY_IN_PROGRESS_OR_COMPLETED');
    }

    // Determine safe-scope preview mutations
    const previewMutations = [];
    if (exec.execution_type === 'EXECUTE_OBSERVATION_EXTENSION') {
      previewMutations.push({ action: 'CREATE_OBSERVATION_EXTENSION_MARKER', cohort_id: exec.cohort_id, metadata: { extended_days: 14 } });
    } else if (exec.execution_type === 'EXECUTE_PARTICIPANT_SUPPORT_TASKS') {
      previewMutations.push({ action: 'CREATE_PARTICIPANT_SUPPORT_TASK', cohort_id: exec.cohort_id, metadata: { task_type: 'SUPPORT_DRILL' } });
    } else if (exec.execution_type === 'EXECUTE_MANUAL_INTERVENTION_TASKS') {
      previewMutations.push({ action: 'CREATE_MANUAL_INTERVENTION_TASK', cohort_id: exec.cohort_id, metadata: { task_type: 'MANUAL_INTERVENTION' } });
    } else if (exec.execution_type === 'EXECUTE_COHORT_CONTINUATION_MARKER') {
      previewMutations.push({ action: 'CREATE_COHORT_CONTINUATION_MARKER', cohort_id: exec.cohort_id });
    } else if (exec.execution_type === 'EXECUTE_RISK_ESCALATION_MARKER') {
      previewMutations.push({ action: 'CREATE_RISK_ESCALATION_MARKER', cohort_id: exec.cohort_id });
    } else {
      throw new Error('UNSUPPORTED_EXECUTION_TYPE_IN_PHASE_140');
    }

    const payload = {
      execution_id: executionId,
      execution_type: exec.execution_type,
      cohort_id: exec.cohort_id,
      tenant_id: exec.tenant_id,
      preview_mutations: previewMutations,
      timestamp: new Date().toISOString()
    };

    const dryRunHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const dryRunId = 'dry_' + crypto.randomBytes(8).toString('hex');

    // Update execution status, blockers, and steps
    const steps = await builderService.getSteps(executionId);
    const dryRunStep = steps.find(s => s.step_key === 'dry_run');
    if (dryRunStep) {
      dryRunStep.status = 'COMPLETED';
      dryRunStep.completed_at = new Date();
    }

    let blockers = {};
    if (typeof exec.execution_blockers_json === 'string') {
      blockers = JSON.parse(exec.execution_blockers_json);
    } else {
      blockers = exec.execution_blockers_json || {};
    }
    blockers.missing_dry_run = false;

    if (!isProdLike) {
      builderService._mockState.dryRuns.set(executionId, {
        dry_run_id: dryRunId,
        execution_id: executionId,
        dry_run_hash: dryRunHash,
        dry_run_payload_json: payload,
        created_at: new Date()
      });
      exec.dry_run_hash = dryRunHash;
      exec.execution_blockers_json = blockers;
      if (exec.execution_status === 'DRAFT') {
        exec.execution_status = 'DRY_RUN_COMPLETED';
      }
      builderService._mockState.executions.set(executionId, exec);
      builderService._mockState.steps.set(executionId, steps);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_execution_dry_runs
         (dry_run_id, execution_id, dry_run_hash, dry_run_payload_json)
         VALUES (?, ?, ?, ?)`,
        [dryRunId, executionId, dryRunHash, JSON.stringify(payload)]
      );

      await db.query(
        "UPDATE controlled_beta_cohort_intervention_execution_steps SET status = 'COMPLETED', completed_at = NOW() WHERE execution_id = ? AND step_key = 'dry_run'",
        [executionId]
      );

      const nextStatus = exec.execution_status === 'DRAFT' ? 'DRY_RUN_COMPLETED' : exec.execution_status;
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_executions SET dry_run_hash = ?, execution_blockers_json = ?, execution_status = ? WHERE execution_id = ?",
        [dryRunHash, JSON.stringify(blockers), nextStatus, executionId]
      );
    }

    await auditService.recordAuditEvent(executionId, 'DRY_RUN_GENERATED', actorId, { dry_run_hash: dryRunHash });

    return {
      dry_run_id: dryRunId,
      dry_run_hash: dryRunHash,
      preview_mutations: previewMutations
    };
  }

  async getDryRun(executionId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return builderService._mockState.dryRuns.get(executionId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_execution_dry_runs WHERE execution_id = ?", [executionId]);
      return list.length > 0 ? list[0] : null;
    }
  }
}

const serviceInstance = new CohortInterventionExecutionDryRunService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionExecutionDryRunService = CohortInterventionExecutionDryRunService;
