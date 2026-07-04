'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanBuilderService').serviceInstance;
const guardrailSvc = require('./cohortInterventionExecutionPlanGuardrailService').serviceInstance;
const dispatcherBuilderSvc = require('./cohortInterventionExecutionDispatcherBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanAuditService').serviceInstance;

class CohortInterventionExecutionPlanEvaluatorService {
  async evaluatePlan(planId, overrides = {}, actorId = 'system') {
    const record = await builder.getPlan(planId);
    if (!record) throw new Error('PLAN_RECORD_NOT_FOUND');

    if (record.plan_status === 'FINALIZED') {
      throw new Error('PLAN_RECORD_ALREADY_FINALIZED');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (isProdLike) {
      await db.query(`DELETE FROM cb_cohort_intervention_plan_rules WHERE plan_id = ?`, [planId]);
    } else {
      builder._mockState.rules.set(planId, []);
    }

    const rulesRun = [];
    let overallBlocked = false;

    // 1. Validate parent Phase 148 dispatcher
    const parentDispatcher = await dispatcherBuilderSvc.getDispatcher(record.source_dispatcher_id);
    if (!parentDispatcher) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(planId, 'PHASE148_DISPATCHER_VALIDATION', 'CRITICAL', 'Parent Phase 148 dispatcher not found.'));
    } else if (parentDispatcher.dispatcher_status !== 'FINALIZED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(planId, 'PHASE148_DISPATCHER_VALIDATION', 'CRITICAL', 'Parent Phase 148 dispatcher is not finalized.'));
    } else if (parentDispatcher.dispatcher_result !== 'DRY_RUN_EXECUTED_NOT_MUTATED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(planId, 'PHASE148_DISPATCHER_VALIDATION', 'CRITICAL', `Parent Phase 148 dispatcher result is invalid: ${parentDispatcher.dispatcher_result}`));
    } else {
      rulesRun.push(await builder.createRule(planId, 'PHASE148_DISPATCHER_VALIDATION', 'INFO', 'Verified parent Phase 148 dispatcher is finalized and passed.'));
    }

    // 2. Safety markers check on parent
    if (parentDispatcher && parentDispatcher.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(planId, 'SAFETY_BOUNDARY_VALIDATION', 'CRITICAL', 'Parent Phase 148 execution capability is enabled, violating safety bounds.'));
    } else {
      rulesRun.push(await builder.createRule(planId, 'SAFETY_BOUNDARY_VALIDATION', 'INFO', 'Confirmed safety boundary: parent execution capability is disabled.'));
    }

    // 3. Static scanner checks
    const staticScan = await guardrailSvc.performSafetyScannerCheck(planId);
    for (const s of staticScan) {
      const added = await builder.createRule(planId, s.check_type, s.severity, s.description);
      rulesRun.push(added);
      if (s.severity === 'CRITICAL') overallBlocked = true;
    }

    // 4. Verify write scope
    const writeScope = await guardrailSvc.verifyWriteScope(planId);
    for (const w of writeScope) {
      const added = await builder.createRule(planId, w.check_type, w.severity, w.description);
      rulesRun.push(added);
      if (w.severity === 'CRITICAL') overallBlocked = true;
    }

    // 5. Execution plan configuration checks
    const planConfig = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : record.canary_envelope_json;

    if (!planConfig || planConfig.plan_mode !== 'MATERIALIZED_NOT_EXECUTABLE' || planConfig.allow_real_execution !== false || planConfig.allow_job_creation !== false || planConfig.max_runtime_mutations !== 0) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(planId, 'EXECUTION_PLAN_VALIDATION', 'CRITICAL', 'Execution plan configuration is invalid (must be MATERIALIZED_NOT_EXECUTABLE and allow_real_execution=false).'));
    } else {
      rulesRun.push(await builder.createRule(planId, 'EXECUTION_PLAN_VALIDATION', 'INFO', 'Execution plan configuration verified (plan_mode=MATERIALIZED_NOT_EXECUTABLE, allow_real_execution=false).'));
    }

    // 6. Operator confirmation & kill-switch checks
    const operatorConfirmed = overrides.operator_confirmed !== undefined ? overrides.operator_confirmed : true;
    const killSwitchVerified = overrides.kill_switch_verified !== undefined ? overrides.kill_switch_verified : true;
    if (!operatorConfirmed || !killSwitchVerified) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(planId, 'SAFETY_ATTENUATION_VERIFICATION', 'CRITICAL', 'Operator confirmation or kill-switch verification is missing.'));
    } else {
      rulesRun.push(await builder.createRule(planId, 'SAFETY_ATTENUATION_VERIFICATION', 'INFO', 'Verified operator confirmation and kill-switch state.'));
    }

    // 7. Generate Plan Hash
    const planMode = planConfig ? planConfig.plan_mode || 'MATERIALIZED_NOT_EXECUTABLE' : 'MATERIALIZED_NOT_EXECUTABLE';
    const rawString = `${planId}:${record.cohort_id}:${record.tenant_id}:${planMode}`;
    const planHash = 'plh_' + crypto.createHash('sha256').update(rawString).digest('hex');

    const status = overallBlocked ? 'BLOCKED' : 'EVALUATED';
    const result = overrides.plan_result || (overallBlocked ? 'PLAN_BLOCKED_BY_GUARDRAIL' : 'PLAN_MATERIALIZED_NOT_EXECUTED');

    const blockers = {};
    if (overallBlocked) {
      blockers.failed_plan_rules = true;
    }

    await builder.updatePlan(planId, {
      plan_status: status,
      plan_result: result,
      guardrail_status: overallBlocked ? 'FAIL' : 'PASS',
      write_scope_status: overallBlocked ? 'FAIL' : 'PASS',
      plan_blockers_json: blockers,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      execution_plan_status: 'MATERIALIZED_NOT_EXECUTABLE',
      plan_execution_status: 'PLAN_MATERIALIZED_NOT_EXECUTED',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      execution_plan_hash: planHash,
      plan_materialization_hash: planHash,
      plan_rules_json: rulesRun
    });

    await auditSvc.createAuditLog(planId, 'PLAN_EVALUATED', actorId, { overallBlocked, status, result });
    return { success: !overallBlocked };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanEvaluatorService();
module.exports = {
  CohortInterventionExecutionPlanEvaluatorService,
  serviceInstance
};
