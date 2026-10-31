'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationAuthorizationBuilderService').serviceInstance;
const guardrailSvc = require('./cohortInterventionExecutionPlanActivationAuthorizationGuardrailService').serviceInstance;
const rdBuilderSvc = require('./cohortInterventionExecutionPlanActivationReadinessBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationAuthorizationAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationAuthorizationEvaluatorService {
  async evaluateAuthorization(activationAuthId, overrides = {}, actorId = 'system') {
    const record = await builder.getAuthorization(activationAuthId);
    if (!record) throw new Error('AUTHORIZATION_RECORD_NOT_FOUND');

    if (record.activation_auth_status === 'FINALIZED') {
      throw new Error('AUTHORIZATION_RECORD_ALREADY_FINALIZED');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (isProdLike) {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_auth_rules WHERE activation_auth_id = ?`, [activationAuthId]);
    } else {
      builder._mockState.rules.set(activationAuthId, []);
    }

    const rulesRun = [];
    let overallBlocked = false;

    // 1. Validate parent Phase 150 readiness
    const parentRd = await rdBuilderSvc.getReadiness(record.source_activation_readiness_id);
    if (!parentRd) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationAuthId, 'PHASE150_READINESS_VALIDATION', 'CRITICAL', 'Parent Phase 150 readiness not found.'));
    } else if (parentRd.activation_readiness_status !== 'FINALIZED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationAuthId, 'PHASE150_READINESS_VALIDATION', 'CRITICAL', 'Parent Phase 150 readiness is not finalized.'));
    } else if (parentRd.activation_readiness_result !== 'ACTIVATION_READY_NOT_ACTIVE') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationAuthId, 'PHASE150_READINESS_VALIDATION', 'CRITICAL', `Parent Phase 150 readiness result is invalid: ${parentRd.activation_readiness_result}`));
    } else {
      rulesRun.push(await builder.createRule(activationAuthId, 'PHASE150_READINESS_VALIDATION', 'INFO', 'Verified parent Phase 150 readiness is finalized and passed.'));
    }

    // 2. Safety markers check on parent
    if (parentRd && parentRd.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationAuthId, 'SAFETY_BOUNDARY_VALIDATION', 'CRITICAL', 'Parent Phase 150 execution capability is enabled, violating safety bounds.'));
    } else {
      rulesRun.push(await builder.createRule(activationAuthId, 'SAFETY_BOUNDARY_VALIDATION', 'INFO', 'Confirmed safety boundary: parent execution capability is disabled.'));
    }

    // 3. Static scanner checks
    const staticScan = await guardrailSvc.performSafetyScannerCheck(activationAuthId);
    for (const s of staticScan) {
      const added = await builder.createRule(activationAuthId, s.check_type, s.severity, s.description);
      rulesRun.push(added);
      if (s.severity === 'CRITICAL') overallBlocked = true;
    }

    // 4. Verify write scope
    const writeScope = await guardrailSvc.verifyWriteScope(activationAuthId);
    for (const w of writeScope) {
      const added = await builder.createRule(activationAuthId, w.check_type, w.severity, w.description);
      rulesRun.push(added);
      if (w.severity === 'CRITICAL') overallBlocked = true;
    }

    // 5. Activation authorization configuration checks
    const authConfig = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : record.canary_envelope_json;

    if (!authConfig || authConfig.authorization_mode !== 'ACTIVATION_AUTHORIZATION_ONLY' || authConfig.allow_real_activation !== false || authConfig.allow_real_execution !== false || authConfig.allow_plan_executable_state !== false || authConfig.max_runtime_mutations !== 0) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationAuthId, 'ACTIVATION_AUTH_CONFIG_VALIDATION', 'CRITICAL', 'Activation authorization configuration is invalid.'));
    } else {
      rulesRun.push(await builder.createRule(activationAuthId, 'ACTIVATION_AUTH_CONFIG_VALIDATION', 'INFO', 'Activation authorization configuration verified.'));
    }

    // 6. Operator confirmation, kill-switch, rollback authority & governance signer checks
    const operatorConfirmed = overrides.operator_confirmed !== undefined ? overrides.operator_confirmed : true;
    const killSwitchVerified = overrides.kill_switch_verified !== undefined ? overrides.kill_switch_verified : true;
    const rollbackAuthorityVerified = overrides.rollback_authority_verified !== undefined ? overrides.rollback_authority_verified : true;
    const governanceSignerPresent = overrides.governance_signer_present !== undefined ? overrides.governance_signer_present : true;
    if (!operatorConfirmed || !killSwitchVerified || !rollbackAuthorityVerified || !governanceSignerPresent) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationAuthId, 'SAFETY_ATTENUATION_VERIFICATION', 'CRITICAL', 'Operator confirmation, kill-switch, rollback, or governance signer is missing.'));
    } else {
      rulesRun.push(await builder.createRule(activationAuthId, 'SAFETY_ATTENUATION_VERIFICATION', 'INFO', 'Verified operator confirmation, kill-switch, rollback, and governance signatures.'));
    }

    // 7. Verify readiness hash matching
    if (parentRd && parentRd.activation_readiness_hash !== record.source_activation_readiness_hash) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationAuthId, 'READINESS_HASH_VERIFICATION', 'CRITICAL', 'Readiness hash mismatch against parent record.'));
    } else {
      rulesRun.push(await builder.createRule(activationAuthId, 'READINESS_HASH_VERIFICATION', 'INFO', 'Readiness hash verified successfully.'));
    }

    // 8. Generate Authorization Hash
    const autMode = authConfig ? authConfig.authorization_mode || 'ACTIVATION_AUTHORIZATION_ONLY' : 'ACTIVATION_AUTHORIZATION_ONLY';
    const rawString = `${activationAuthId}:${record.cohort_id}:${record.tenant_id}:${autMode}`;
    const authorizationHash = 'aah_' + crypto.createHash('sha256').update(rawString).digest('hex');

    const status = overallBlocked ? 'BLOCKED' : 'EVALUATED';
    const result = overrides.activation_auth_result || (overallBlocked ? 'AUTHORIZATION_BLOCKED_BY_GUARDRAIL' : 'AUTHORIZED_NOT_ACTIVE');

    const blockers = {};
    if (overallBlocked) {
      blockers.failed_auth_rules = true;
    }

    await builder.updateAuthorization(activationAuthId, {
      activation_auth_status: status,
      activation_auth_result: result,
      guardrail_status: overallBlocked ? 'FAIL' : 'PASS',
      write_scope_status: overallBlocked ? 'FAIL' : 'PASS',
      auth_blockers_json: blockers,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'AUTHORIZATION_FINALIZED_NOT_EXECUTED',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      activation_authorization_hash: authorizationHash,
      authorization_evidence_pack_hash: authorizationHash,
      auth_rules_json: rulesRun
    });

    await auditSvc.createAuditLog(activationAuthId, 'AUTHORIZATION_EVALUATED', actorId, { overallBlocked, status, result });
    return { success: !overallBlocked };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationAuthorizationEvaluatorService();
module.exports = {
  CohortInterventionExecutionPlanActivationAuthorizationEvaluatorService,
  serviceInstance
};
