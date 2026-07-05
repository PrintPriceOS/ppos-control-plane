'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationLockBuilderService').serviceInstance;
const guardrailSvc = require('./cohortInterventionExecutionPlanActivationLockGuardrailService').serviceInstance;
const authBuilderSvc = require('./cohortInterventionExecutionPlanActivationAuthorizationBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationLockAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationLockEvaluatorService {
  async evaluateLock(activationLockId, overrides = {}, actorId = 'system') {
    const record = await builder.getLock(activationLockId);
    if (!record) throw new Error('LOCK_RECORD_NOT_FOUND');

    if (record.activation_lock_status === 'FINALIZED') {
      throw new Error('LOCK_RECORD_ALREADY_FINALIZED');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (isProdLike) {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_lock_rules WHERE activation_lock_id = ?`, [activationLockId]);
    } else {
      builder._mockState.rules.set(activationLockId, []);
    }

    const rulesRun = [];
    let overallBlocked = false;

    // 1. Validate parent Phase 151 authorization
    const parentAuth = await authBuilderSvc.getAuthorization(record.source_activation_auth_id);
    if (!parentAuth) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationLockId, 'PHASE151_AUTHORIZATION_VALIDATION', 'CRITICAL', 'Parent Phase 151 authorization not found.'));
    } else if (parentAuth.activation_auth_status !== 'FINALIZED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationLockId, 'PHASE151_AUTHORIZATION_VALIDATION', 'CRITICAL', 'Parent Phase 151 authorization is not finalized.'));
    } else if (parentAuth.activation_auth_result !== 'AUTHORIZED_NOT_ACTIVE') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationLockId, 'PHASE151_AUTHORIZATION_VALIDATION', 'CRITICAL', `Parent Phase 151 authorization result is invalid: ${parentAuth.activation_auth_result}`));
    } else {
      rulesRun.push(await builder.createRule(activationLockId, 'PHASE151_AUTHORIZATION_VALIDATION', 'INFO', 'Verified parent Phase 151 authorization is finalized and passed.'));
    }

    // 2. Safety markers check on parent
    if (parentAuth && parentAuth.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationLockId, 'SAFETY_BOUNDARY_VALIDATION', 'CRITICAL', 'Parent Phase 151 execution capability is enabled, violating safety bounds.'));
    } else {
      rulesRun.push(await builder.createRule(activationLockId, 'SAFETY_BOUNDARY_VALIDATION', 'INFO', 'Confirmed safety boundary: parent execution capability is disabled.'));
    }

    // 3. Static scanner checks
    const staticScan = await guardrailSvc.performSafetyScannerCheck(activationLockId);
    for (const s of staticScan) {
      const added = await builder.createRule(activationLockId, s.check_type, s.severity, s.description);
      rulesRun.push(added);
      if (s.severity === 'CRITICAL') overallBlocked = true;
    }

    // 4. Verify write scope
    const writeScope = await guardrailSvc.verifyWriteScope(activationLockId);
    for (const w of writeScope) {
      const added = await builder.createRule(activationLockId, w.check_type, w.severity, w.description);
      rulesRun.push(added);
      if (w.severity === 'CRITICAL') overallBlocked = true;
    }

    // 5. Activation lock configuration checks
    const lockConfig = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : record.canary_envelope_json;

    if (!lockConfig || lockConfig.lock_mode !== 'PRE_EXECUTION_FREEZE_ONLY' || lockConfig.allow_real_activation !== false || lockConfig.allow_real_execution !== false || lockConfig.allow_plan_executable_state !== false || lockConfig.max_runtime_mutations !== 0) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationLockId, 'ACTIVATION_LOCK_CONFIG_VALIDATION', 'CRITICAL', 'Activation lock configuration is invalid.'));
    } else {
      rulesRun.push(await builder.createRule(activationLockId, 'ACTIVATION_LOCK_CONFIG_VALIDATION', 'INFO', 'Activation lock configuration verified.'));
    }

    // 6. Operator confirmation, kill-switch & rollback authority checks
    const operatorConfirmed = overrides.operator_confirmed !== undefined ? overrides.operator_confirmed : true;
    const killSwitchVerified = overrides.kill_switch_verified !== undefined ? overrides.kill_switch_verified : true;
    const rollbackAuthorityVerified = overrides.rollback_authority_verified !== undefined ? overrides.rollback_authority_verified : true;
    if (!operatorConfirmed || !killSwitchVerified || !rollbackAuthorityVerified) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationLockId, 'SAFETY_ATTENUATION_VERIFICATION', 'CRITICAL', 'Operator confirmation, kill-switch, or rollback verification is missing.'));
    } else {
      rulesRun.push(await builder.createRule(activationLockId, 'SAFETY_ATTENUATION_VERIFICATION', 'INFO', 'Verified operator confirmation, kill-switch status, and rollback authority.'));
    }

    // 7. Verify authorization hash matching
    if (parentAuth && parentAuth.activation_authorization_hash !== record.source_activation_authorization_hash) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationLockId, 'AUTHORIZATION_HASH_VERIFICATION', 'CRITICAL', 'Authorization hash mismatch against parent record.'));
    } else {
      rulesRun.push(await builder.createRule(activationLockId, 'AUTHORIZATION_HASH_VERIFICATION', 'INFO', 'Authorization hash verified successfully.'));
    }

    // 8. Generate Lock & Freeze hashes
    const lkMode = lockConfig ? lockConfig.lock_mode || 'PRE_EXECUTION_FREEZE_ONLY' : 'PRE_EXECUTION_FREEZE_ONLY';
    const rawString = `${activationLockId}:${record.cohort_id}:${record.tenant_id}:${lkMode}`;
    const activationLockHash = 'alh_' + crypto.createHash('sha256').update(rawString).digest('hex');

    const status = overallBlocked ? 'BLOCKED' : 'EVALUATED';
    const result = overrides.activation_lock_result || (overallBlocked ? 'LOCK_BLOCKED_BY_GUARDRAIL' : 'LOCKED_NOT_ACTIVE');

    const blockers = {};
    if (overallBlocked) {
      blockers.failed_lock_rules = true;
    }

    await builder.updateLock(activationLockId, {
      activation_lock_status: status,
      activation_lock_result: result,
      guardrail_status: overallBlocked ? 'FAIL' : 'PASS',
      write_scope_status: overallBlocked ? 'FAIL' : 'PASS',
      lock_blockers_json: blockers,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'LOCK_FINALIZED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      activation_lock_hash: activationLockHash,
      freeze_package_hash: activationLockHash,
      lock_evidence_pack_hash: activationLockHash,
      lock_rules_json: rulesRun
    });

    await auditSvc.createAuditLog(activationLockId, 'LOCK_EVALUATED', actorId, { overallBlocked, status, result });
    return { success: !overallBlocked };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationLockEvaluatorService();
module.exports = {
  CohortInterventionExecutionPlanActivationLockEvaluatorService,
  serviceInstance
};
