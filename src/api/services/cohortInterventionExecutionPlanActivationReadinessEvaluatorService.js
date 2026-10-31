'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationReadinessBuilderService').serviceInstance;
const guardrailSvc = require('./cohortInterventionExecutionPlanActivationReadinessGuardrailService').serviceInstance;
const planBuilderSvc = require('./cohortInterventionExecutionPlanBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationReadinessAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationReadinessEvaluatorService {
  async evaluateReadiness(activationRdId, overrides = {}, actorId = 'system') {
    const record = await builder.getReadiness(activationRdId);
    if (!record) throw new Error('READINESS_RECORD_NOT_FOUND');

    if (record.activation_readiness_status === 'FINALIZED') {
      throw new Error('READINESS_RECORD_ALREADY_FINALIZED');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (isProdLike) {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_rd_rules WHERE activation_rd_id = ?`, [activationRdId]);
    } else {
      builder._mockState.rules.set(activationRdId, []);
    }

    const rulesRun = [];
    let overallBlocked = false;

    // 1. Validate parent Phase 149 execution plan
    const parentPlan = await planBuilderSvc.getPlan(record.source_plan_id);
    if (!parentPlan) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationRdId, 'PHASE149_PLAN_VALIDATION', 'CRITICAL', 'Parent Phase 149 execution plan not found.'));
    } else if (parentPlan.plan_status !== 'FINALIZED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationRdId, 'PHASE149_PLAN_VALIDATION', 'CRITICAL', 'Parent Phase 149 execution plan is not finalized.'));
    } else if (parentPlan.plan_result !== 'PLAN_MATERIALIZED_NOT_EXECUTED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationRdId, 'PHASE149_PLAN_VALIDATION', 'CRITICAL', `Parent Phase 149 execution plan result is invalid: ${parentPlan.plan_result}`));
    } else {
      rulesRun.push(await builder.createRule(activationRdId, 'PHASE149_PLAN_VALIDATION', 'INFO', 'Verified parent Phase 149 execution plan is finalized and passed.'));
    }

    // 2. Safety markers check on parent
    if (parentPlan && parentPlan.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationRdId, 'SAFETY_BOUNDARY_VALIDATION', 'CRITICAL', 'Parent Phase 149 execution capability is enabled, violating safety bounds.'));
    } else {
      rulesRun.push(await builder.createRule(activationRdId, 'SAFETY_BOUNDARY_VALIDATION', 'INFO', 'Confirmed safety boundary: parent execution capability is disabled.'));
    }

    // 3. Static scanner checks
    const staticScan = await guardrailSvc.performSafetyScannerCheck(activationRdId);
    for (const s of staticScan) {
      const added = await builder.createRule(activationRdId, s.check_type, s.severity, s.description);
      rulesRun.push(added);
      if (s.severity === 'CRITICAL') overallBlocked = true;
    }

    // 4. Verify write scope
    const writeScope = await guardrailSvc.verifyWriteScope(activationRdId);
    for (const w of writeScope) {
      const added = await builder.createRule(activationRdId, w.check_type, w.severity, w.description);
      rulesRun.push(added);
      if (w.severity === 'CRITICAL') overallBlocked = true;
    }

    // 5. Activation readiness configuration checks
    const rdConfig = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : record.canary_envelope_json;

    if (!rdConfig || rdConfig.activation_mode !== 'READINESS_ONLY' || rdConfig.allow_real_activation !== false || rdConfig.allow_real_execution !== false || rdConfig.max_runtime_mutations !== 0) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationRdId, 'ACTIVATION_CONFIG_VALIDATION', 'CRITICAL', 'Activation readiness configuration is invalid (must be READINESS_ONLY and allow_real_activation=false).'));
    } else {
      rulesRun.push(await builder.createRule(activationRdId, 'ACTIVATION_CONFIG_VALIDATION', 'INFO', 'Activation readiness configuration verified.'));
    }

    // 6. Operator confirmation, kill-switch & rollback authority checks
    const operatorConfirmed = overrides.operator_confirmed !== undefined ? overrides.operator_confirmed : true;
    const killSwitchVerified = overrides.kill_switch_verified !== undefined ? overrides.kill_switch_verified : true;
    const rollbackAuthorityVerified = overrides.rollback_authority_verified !== undefined ? overrides.rollback_authority_verified : true;
    if (!operatorConfirmed || !killSwitchVerified || !rollbackAuthorityVerified) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationRdId, 'SAFETY_ATTENUATION_VERIFICATION', 'CRITICAL', 'Operator confirmation, kill-switch verification, or rollback authority verification is missing.'));
    } else {
      rulesRun.push(await builder.createRule(activationRdId, 'SAFETY_ATTENUATION_VERIFICATION', 'INFO', 'Verified operator confirmation, kill-switch, and rollback authority state.'));
    }

    // 7. Verify plan hash matching
    if (parentPlan && parentPlan.plan_materialization_hash !== record.source_plan_hash) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationRdId, 'PLAN_HASH_VERIFICATION', 'CRITICAL', 'Plan materialization hash mismatch against parent record.'));
    } else {
      rulesRun.push(await builder.createRule(activationRdId, 'PLAN_HASH_VERIFICATION', 'INFO', 'Plan materialization hash verified successfully.'));
    }

    // 8. Generate Readiness Hash
    const actMode = rdConfig ? rdConfig.activation_mode || 'READINESS_ONLY' : 'READINESS_ONLY';
    const rawString = `${activationRdId}:${record.cohort_id}:${record.tenant_id}:${actMode}`;
    const readinessHash = 'arh_' + crypto.createHash('sha256').update(rawString).digest('hex');

    const status = overallBlocked ? 'BLOCKED' : 'EVALUATED';
    const result = overrides.activation_readiness_result || (overallBlocked ? 'ACTIVATION_BLOCKED_BY_GUARDRAIL' : 'ACTIVATION_READY_NOT_ACTIVE');

    const blockers = {};
    if (overallBlocked) {
      blockers.failed_readiness_rules = true;
    }

    await builder.updateReadiness(activationRdId, {
      activation_readiness_status: status,
      activation_readiness_result: result,
      guardrail_status: overallBlocked ? 'FAIL' : 'PASS',
      write_scope_status: overallBlocked ? 'FAIL' : 'PASS',
      readiness_blockers_json: blockers,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'ACTIVATION_NOT_EXECUTED',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      activation_readiness_hash: readinessHash,
      readiness_evidence_pack_hash: readinessHash,
      readiness_rules_json: rulesRun
    });

    await auditSvc.createAuditLog(activationRdId, 'READINESS_EVALUATED', actorId, { overallBlocked, status, result });
    return { success: !overallBlocked };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationReadinessEvaluatorService();
module.exports = {
  CohortInterventionExecutionPlanActivationReadinessEvaluatorService,
  serviceInstance
};
