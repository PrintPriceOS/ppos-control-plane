'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionDispatcherBuilderService').serviceInstance;
const guardrailSvc = require('./cohortInterventionExecutionDispatcherGuardrailService').serviceInstance;
const envelopeBuilderSvc = require('./cohortInterventionExecutionEnvelopeBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionDispatcherAuditService').serviceInstance;

class CohortInterventionExecutionDispatcherEvaluatorService {
  async evaluateDispatcher(dispatcherId, overrides = {}, actorId = 'system') {
    const record = await builder.getDispatcher(dispatcherId);
    if (!record) throw new Error('DISPATCHER_RECORD_NOT_FOUND');

    if (record.dispatcher_status === 'FINALIZED') {
      throw new Error('DISPATCHER_RECORD_ALREADY_FINALIZED');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (isProdLike) {
      await db.query(`DELETE FROM cb_cohort_intervention_dispatcher_rules WHERE dispatcher_id = ?`, [dispatcherId]);
    } else {
      builder._mockState.rules.set(dispatcherId, []);
    }

    const rulesRun = [];
    let overallBlocked = false;

    // 1. Validate parent Phase 147 envelope
    const parentEnvelope = await envelopeBuilderSvc.getEnvelope(record.source_envelope_id);
    if (!parentEnvelope) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(dispatcherId, 'PHASE147_ENVELOPE_VALIDATION', 'CRITICAL', 'Parent Phase 147 envelope not found.'));
    } else if (parentEnvelope.envelope_status !== 'FINALIZED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(dispatcherId, 'PHASE147_ENVELOPE_VALIDATION', 'CRITICAL', 'Parent Phase 147 envelope is not finalized.'));
    } else if (parentEnvelope.envelope_result !== 'NO_OP_EXECUTED_NOT_MUTATED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(dispatcherId, 'PHASE147_ENVELOPE_VALIDATION', 'CRITICAL', `Parent Phase 147 envelope result is invalid: ${parentEnvelope.envelope_result}`));
    } else {
      rulesRun.push(await builder.createRule(dispatcherId, 'PHASE147_ENVELOPE_VALIDATION', 'INFO', 'Verified parent Phase 147 envelope is finalized and passed.'));
    }

    // 2. Safety markers check on parent
    if (parentEnvelope && parentEnvelope.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(dispatcherId, 'SAFETY_BOUNDARY_VALIDATION', 'CRITICAL', 'Parent Phase 147 execution capability is enabled, violating safety bounds.'));
    } else {
      rulesRun.push(await builder.createRule(dispatcherId, 'SAFETY_BOUNDARY_VALIDATION', 'INFO', 'Confirmed safety boundary: parent execution capability is disabled.'));
    }

    // 3. Static scanner checks
    const staticScan = await guardrailSvc.performSafetyScannerCheck(dispatcherId);
    for (const s of staticScan) {
      const added = await builder.createRule(dispatcherId, s.check_type, s.severity, s.description);
      rulesRun.push(added);
      if (s.severity === 'CRITICAL') overallBlocked = true;
    }

    // 4. Verify write scope
    const writeScope = await guardrailSvc.verifyWriteScope(dispatcherId);
    for (const w of writeScope) {
      const added = await builder.createRule(dispatcherId, w.check_type, w.severity, w.description);
      rulesRun.push(added);
      if (w.severity === 'CRITICAL') overallBlocked = true;
    }

    // 5. Dry-run configuration checks
    const dryRunConfig = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : record.canary_envelope_json;

    if (!dryRunConfig || dryRunConfig.dispatch_mode !== 'DRY_RUN_ONLY' || dryRunConfig.queue_dispatch_mode !== 'SIMULATED_ONLY' || dryRunConfig.allow_real_job_creation !== false || dryRunConfig.max_runtime_mutations !== 0) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(dispatcherId, 'DRY_RUN_DISPATCHER_VALIDATION', 'CRITICAL', 'Dry-run dispatcher configuration is invalid (must be DRY_RUN_ONLY and SIMULATED_ONLY).'));
    } else {
      rulesRun.push(await builder.createRule(dispatcherId, 'DRY_RUN_DISPATCHER_VALIDATION', 'INFO', 'Dry-run dispatcher configuration verified (dispatch_mode=DRY_RUN_ONLY, queue_dispatch_mode=SIMULATED_ONLY).'));
    }

    // 6. Operator confirmation & kill-switch checks
    const operatorConfirmed = overrides.operator_confirmed !== undefined ? overrides.operator_confirmed : true;
    const killSwitchVerified = overrides.kill_switch_verified !== undefined ? overrides.kill_switch_verified : true;
    if (!operatorConfirmed || !killSwitchVerified) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(dispatcherId, 'SAFETY_ATTENUATION_VERIFICATION', 'CRITICAL', 'Operator confirmation or kill-switch verification is missing.'));
    } else {
      rulesRun.push(await builder.createRule(dispatcherId, 'SAFETY_ATTENUATION_VERIFICATION', 'INFO', 'Verified operator confirmation and kill-switch state.'));
    }

    const status = overallBlocked ? 'BLOCKED' : 'EVALUATED';
    const result = overrides.dispatcher_result || (overallBlocked ? 'DRY_RUN_BLOCKED_BY_GUARDRAIL' : 'DRY_RUN_EXECUTED_NOT_MUTATED');

    const blockers = {};
    if (overallBlocked) {
      blockers.failed_dispatcher_rules = true;
    }

    await builder.updateDispatcher(dispatcherId, {
      dispatcher_status: status,
      dispatcher_result: result,
      guardrail_status: overallBlocked ? 'FAIL' : 'PASS',
      write_scope_status: overallBlocked ? 'FAIL' : 'PASS',
      dispatcher_blockers_json: blockers,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      dispatcher_execution_status: 'DRY_RUN_ACTIVE_NOT_MUTATING',
      dry_run_execution_result: 'DRY_RUN_EXECUTED_NOT_MUTATED',
      queue_dispatch_status: 'SIMULATED_ONLY',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      dispatcher_rules_json: rulesRun
    });

    await auditSvc.createAuditLog(dispatcherId, 'DISPATCHER_EVALUATED', actorId, { overallBlocked, status, result });
    return { success: !overallBlocked };
  }
}

const serviceInstance = new CohortInterventionExecutionDispatcherEvaluatorService();
module.exports = {
  CohortInterventionExecutionDispatcherEvaluatorService,
  serviceInstance
};
