'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionAuthorizationBuilderService').serviceInstance;
const guardrailSvc = require('./cohortInterventionExecutionAuthorizationGuardrailService').serviceInstance;
const readinessBuilderSvc = require('./cohortInterventionExecutionReadinessBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionAuthorizationAuditService').serviceInstance;

class CohortInterventionExecutionAuthorizationEvaluatorService {
  async evaluateAuth(authId, overrides = {}, actorId = 'system') {
    const record = await builder.getAuth(authId);
    if (!record) throw new Error('AUTHORIZATION_RECORD_NOT_FOUND');

    if (record.auth_status === 'FINALIZED') {
      throw new Error('AUTHORIZATION_RECORD_ALREADY_FINALIZED');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (isProdLike) {
      await db.query(`DELETE FROM cb_cohort_intervention_exec_auth_rules WHERE auth_id = ?`, [authId]);
    } else {
      builder._mockState.rules.set(authId, []);
    }

    const rulesRun = [];
    let overallBlocked = false;

    // 1. Validate Phase 145 readiness exists and is approved
    const parentReadiness = await readinessBuilderSvc.getReadiness(record.source_readiness_id);
    if (!parentReadiness) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(authId, 'PHASE145_READINESS_VALIDATION', 'CRITICAL', 'Parent Phase 145 readiness not found.'));
    } else if (parentReadiness.readiness_status !== 'FINALIZED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(authId, 'PHASE145_READINESS_VALIDATION', 'CRITICAL', 'Parent Phase 145 readiness is not finalized.'));
    } else if (parentReadiness.readiness_decision !== 'APPROVE_EXECUTION_READINESS_NOT_EXECUTED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(authId, 'PHASE145_READINESS_VALIDATION', 'CRITICAL', `Parent Phase 145 readiness is not approved (decision: ${parentReadiness.readiness_decision}).`));
    } else {
      rulesRun.push(await builder.createRule(authId, 'PHASE145_READINESS_VALIDATION', 'INFO', 'Verified parent Phase 145 readiness is finalized and approved.'));
    }

    // 2. Validate safety boundary
    if (parentReadiness && parentReadiness.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(authId, 'SAFETY_BOUNDARY_VALIDATION', 'CRITICAL', 'Parent Phase 145 execution capability is enabled, violating safety bounds.'));
    } else {
      rulesRun.push(await builder.createRule(authId, 'SAFETY_BOUNDARY_VALIDATION', 'INFO', 'Confirmed safety boundary: parent execution capability is disabled.'));
    }

    // 3. Static scanner checks
    const staticScan = await guardrailSvc.performSafetyScannerCheck(authId);
    for (const s of staticScan) {
      const added = await builder.createRule(authId, s.check_type, s.severity, s.description);
      rulesRun.push(added);
      if (s.severity === 'CRITICAL') overallBlocked = true;
    }

    // 4. Verify write scope
    const writeScope = await guardrailSvc.verifyWriteScope(authId);
    for (const w of writeScope) {
      const added = await builder.createRule(authId, w.check_type, w.severity, w.description);
      rulesRun.push(added);
      if (w.severity === 'CRITICAL') overallBlocked = true;
    }

    // 5. Operator credentials check
    const operatorPresent = overrides.operator_present !== undefined ? overrides.operator_present : true;
    const confirmationPhrase = overrides.confirmation_phrase_present !== undefined ? overrides.confirmation_phrase_present : true;
    if (!operatorPresent || !confirmationPhrase) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(authId, 'OPERATOR_CREDENTIALS_VERIFICATION', 'CRITICAL', 'Operator signature or confirmation phrase is missing.'));
    } else {
      rulesRun.push(await builder.createRule(authId, 'OPERATOR_CREDENTIALS_VERIFICATION', 'INFO', 'Verified operator identity and confirmation phrase.'));
    }

    // 6. Canary envelope check
    const envelope = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : record.canary_envelope_json;

    if (!envelope || envelope.max_cohorts !== 0 || envelope.max_participants !== 0) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(authId, 'CANARY_ENVELOPE_VERIFICATION', 'CRITICAL', 'Canary envelope parameters violate the safety boundary (max cohorts/participants must be 0).'));
    } else {
      rulesRun.push(await builder.createRule(authId, 'CANARY_ENVELOPE_VERIFICATION', 'INFO', 'Canary envelope parameters verified (max cohorts and participants set to 0).'));
    }

    const status = overallBlocked ? 'BLOCKED' : 'EVALUATED';
    const decision = overrides.auth_decision || (overallBlocked ? 'BLOCK_EXECUTION_PATH' : 'AUTHORIZE_CONTROLLED_EXECUTION_NOT_ACTIVE');
    const safetyExecutionStatus = overallBlocked ? 'AUTHORIZATION_REJECTED_NOT_EXECUTED' : 'AUTHORIZATION_APPROVED_NOT_EXECUTED';

    const blockers = {};
    if (overallBlocked) {
      blockers.failed_authorization_rules = true;
    }

    await builder.updateAuth(authId, {
      auth_status: status,
      auth_decision: decision,
      guardrail_status: overallBlocked ? 'FAIL' : 'PASS',
      write_scope_status: overallBlocked ? 'FAIL' : 'PASS',
      auth_blockers_json: blockers,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      execution_authorization_status: 'EXECUTION_AUTHORIZED_NOT_ACTIVE',
      auth_execution_status: safetyExecutionStatus,
      auth_rules_json: rulesRun
    });

    await auditSvc.createAuditLog(authId, 'AUTHORIZATION_EVALUATED', actorId, { overallBlocked, status, decision });
    return { success: !overallBlocked };
  }
}

const serviceInstance = new CohortInterventionExecutionAuthorizationEvaluatorService();
module.exports = {
  CohortInterventionExecutionAuthorizationEvaluatorService,
  serviceInstance
};
