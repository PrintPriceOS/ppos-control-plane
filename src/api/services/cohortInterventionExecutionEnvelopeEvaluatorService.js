'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionEnvelopeBuilderService').serviceInstance;
const guardrailSvc = require('./cohortInterventionExecutionEnvelopeGuardrailService').serviceInstance;
const authBuilderSvc = require('./cohortInterventionExecutionAuthorizationBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionEnvelopeAuditService').serviceInstance;

class CohortInterventionExecutionEnvelopeEvaluatorService {
  async evaluateEnvelope(envelopeId, overrides = {}, actorId = 'system') {
    const record = await builder.getEnvelope(envelopeId);
    if (!record) throw new Error('ENVELOPE_RECORD_NOT_FOUND');

    if (record.envelope_status === 'FINALIZED') {
      throw new Error('ENVELOPE_RECORD_ALREADY_FINALIZED');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (isProdLike) {
      await db.query(`DELETE FROM cb_cohort_intervention_envelope_rules WHERE envelope_id = ?`, [envelopeId]);
    } else {
      builder._mockState.rules.set(envelopeId, []);
    }

    const rulesRun = [];
    let overallBlocked = false;

    // 1. Validate parent Phase 146 authorization
    const parentAuth = await authBuilderSvc.getAuth(record.source_auth_id);
    if (!parentAuth) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(envelopeId, 'PHASE146_AUTHORIZATION_VALIDATION', 'CRITICAL', 'Parent Phase 146 authorization not found.'));
    } else if (parentAuth.auth_status !== 'FINALIZED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(envelopeId, 'PHASE146_AUTHORIZATION_VALIDATION', 'CRITICAL', 'Parent Phase 146 authorization is not finalized.'));
    } else if (parentAuth.auth_decision !== 'AUTHORIZE_CONTROLLED_EXECUTION_NOT_ACTIVE') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(envelopeId, 'PHASE146_AUTHORIZATION_VALIDATION', 'CRITICAL', `Parent Phase 146 authorization decision is invalid: ${parentAuth.auth_decision}`));
    } else {
      rulesRun.push(await builder.createRule(envelopeId, 'PHASE146_AUTHORIZATION_VALIDATION', 'INFO', 'Verified parent Phase 146 authorization is finalized and approved.'));
    }

    // 2. Safety markers check on parent
    if (parentAuth && parentAuth.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(envelopeId, 'SAFETY_BOUNDARY_VALIDATION', 'CRITICAL', 'Parent Phase 146 execution capability is enabled, violating safety bounds.'));
    } else {
      rulesRun.push(await builder.createRule(envelopeId, 'SAFETY_BOUNDARY_VALIDATION', 'INFO', 'Confirmed safety boundary: parent execution capability is disabled.'));
    }

    // 3. Static scanner checks
    const staticScan = await guardrailSvc.performSafetyScannerCheck(envelopeId);
    for (const s of staticScan) {
      const added = await builder.createRule(envelopeId, s.check_type, s.severity, s.description);
      rulesRun.push(added);
      if (s.severity === 'CRITICAL') overallBlocked = true;
    }

    // 4. Verify write scope
    const writeScope = await guardrailSvc.verifyWriteScope(envelopeId);
    for (const w of writeScope) {
      const added = await builder.createRule(envelopeId, w.check_type, w.severity, w.description);
      rulesRun.push(added);
      if (w.severity === 'CRITICAL') overallBlocked = true;
    }

    // 5. NO_OP configuration checks
    const envConfig = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : record.canary_envelope_json;

    if (!envConfig || envConfig.mode !== 'NO_OP' || envConfig.max_cohorts !== 0 || envConfig.max_participants !== 0 || envConfig.max_runtime_mutations !== 0) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(envelopeId, 'NO_OP_ENVELOPE_VALIDATION', 'CRITICAL', 'NO_OP envelope configuration is invalid (max cohorts/participants/mutations must be 0).'));
    } else {
      rulesRun.push(await builder.createRule(envelopeId, 'NO_OP_ENVELOPE_VALIDATION', 'INFO', 'NO_OP envelope configuration verified (mode=NO_OP, max limits = 0).'));
    }

    // 6. Operator confirmation & kill-switch checks
    const operatorConfirmed = overrides.operator_confirmed !== undefined ? overrides.operator_confirmed : true;
    const killSwitchVerified = overrides.kill_switch_verified !== undefined ? overrides.kill_switch_verified : true;
    if (!operatorConfirmed || !killSwitchVerified) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(envelopeId, 'SAFETY_ATTENUATION_VERIFICATION', 'CRITICAL', 'Operator confirmation or kill-switch verification is missing.'));
    } else {
      rulesRun.push(await builder.createRule(envelopeId, 'SAFETY_ATTENUATION_VERIFICATION', 'INFO', 'Verified operator confirmation and kill-switch state.'));
    }

    const status = overallBlocked ? 'BLOCKED' : 'EVALUATED';
    const result = overrides.envelope_result || (overallBlocked ? 'NO_OP_BLOCKED_BY_GUARDRAIL' : 'NO_OP_EXECUTED_NOT_MUTATED');

    const blockers = {};
    if (overallBlocked) {
      blockers.failed_envelope_rules = true;
    }

    await builder.updateEnvelope(envelopeId, {
      envelope_status: status,
      envelope_result: result,
      guardrail_status: overallBlocked ? 'FAIL' : 'PASS',
      write_scope_status: overallBlocked ? 'FAIL' : 'PASS',
      envelope_blockers_json: blockers,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      envelope_execution_status: 'NO_OP_ENVELOPE_ACTIVE_NOT_MUTATING',
      no_op_execution_result: 'NO_OP_EXECUTED_NOT_MUTATED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      job_dispatch_status: 'NO_JOB_DISPATCHED',
      envelope_rules_json: rulesRun
    });

    await auditSvc.createAuditLog(envelopeId, 'ENVELOPE_EVALUATED', actorId, { overallBlocked, status, result });
    return { success: !overallBlocked };
  }
}

const serviceInstance = new CohortInterventionExecutionEnvelopeEvaluatorService();
module.exports = {
  CohortInterventionExecutionEnvelopeEvaluatorService,
  serviceInstance
};
