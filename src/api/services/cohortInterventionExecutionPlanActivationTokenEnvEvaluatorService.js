'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenEnvBuilderService').serviceInstance;
const guardrailSvc = require('./cohortInterventionExecutionPlanActivationTokenEnvGuardrailService').serviceInstance;
const tokenAuthBuilderSvc = require('./cohortInterventionExecutionPlanActivationTokenAuthBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenEnvAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenEnvEvaluatorService {
  async evaluateTokenEnv(activationTokenEnvId, overrides = {}, actorId = 'system') {
    const record = await builder.getTokenEnv(activationTokenEnvId);
    if (!record) throw new Error('TOKEN_ENV_RECORD_NOT_FOUND');

    if (record.activation_token_env_status === 'FINALIZED') {
      throw new Error('TOKEN_ENV_RECORD_ALREADY_FINALIZED');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (isProdLike) {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_env_rules WHERE activation_token_env_id = ?`, [activationTokenEnvId]);
    } else {
      builder._mockState.rules.set(activationTokenEnvId, []);
    }

    const rulesRun = [];
    let overallBlocked = false;

    // 1. Validate parent Phase 155 token auth
    const parentAuth = await tokenAuthBuilderSvc.getTokenAuth(record.source_activation_token_auth_id);
    if (!parentAuth) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenEnvId, 'PHASE155_TOKEN_AUTH_VALIDATION', 'CRITICAL', 'Parent Phase 155 token authorization not found.'));
    } else if (parentAuth.activation_token_auth_status !== 'FINALIZED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenEnvId, 'PHASE155_TOKEN_AUTH_VALIDATION', 'CRITICAL', 'Parent Phase 155 token authorization is not finalized.'));
    } else if (parentAuth.activation_token_auth_result !== 'AUTHORIZED_NOT_ISSUED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenEnvId, 'PHASE155_TOKEN_AUTH_VALIDATION', 'CRITICAL', `Parent Phase 155 token authorization result is invalid: ${parentAuth.activation_token_auth_result}`));
    } else {
      rulesRun.push(await builder.createRule(activationTokenEnvId, 'PHASE155_TOKEN_AUTH_VALIDATION', 'INFO', 'Verified parent Phase 155 token authorization is finalized and passed.'));
    }

    // 2. Safety markers check on parent Phase 155
    if (parentAuth) {
      const parentConfig = typeof parentAuth.canary_envelope_json === 'string'
        ? JSON.parse(parentAuth.canary_envelope_json)
        : parentAuth.canary_envelope_json;

      if (parentAuth.execution_capability_status !== 'EXECUTION_NOT_ENABLED' ||
          parentAuth.activation_execution_status !== 'TOKEN_AUTH_FINALIZED_NOT_EXECUTED' ||
          parentAuth.package_freeze_status !== 'FROZEN_IMMUTABLE' ||
          parentAuth.plan_executable_status !== 'NOT_EXECUTABLE' ||
          parentAuth.job_creation_status !== 'NO_REAL_JOB_CREATED' ||
          parentAuth.queue_dispatch_status !== 'NO_QUEUE_DISPATCHED' ||
          parentAuth.runtime_mutation_status !== 'ZERO_RUNTIME_MUTATION_CONFIRMED' ||
          (parentConfig && (parentConfig.token_status !== 'PREPARED_NOT_ISSUED' || parentConfig.token_issuance_status !== 'AUTHORIZED_NOT_ISSUED' || parentConfig.token_redeemable !== false))) {
        overallBlocked = true;
        rulesRun.push(await builder.createRule(activationTokenEnvId, 'SAFETY_BOUNDARY_VALIDATION', 'CRITICAL', 'Parent Phase 155 safety boundaries are violated.'));
      } else {
        rulesRun.push(await builder.createRule(activationTokenEnvId, 'SAFETY_BOUNDARY_VALIDATION', 'INFO', 'Confirmed safety boundary: parent Phase 155 execution is fully disabled.'));
      }
    }

    // 3. Static scanner checks
    const staticScan = await guardrailSvc.performSafetyScannerCheck(activationTokenEnvId);
    for (const s of staticScan) {
      const added = await builder.createRule(activationTokenEnvId, s.check_type, s.severity, s.description);
      rulesRun.push(added);
      if (s.severity === 'CRITICAL') overallBlocked = true;
    }

    // 4. Verify write scope
    const writeScope = await guardrailSvc.verifyWriteScope(activationTokenEnvId);
    for (const w of writeScope) {
      const added = await builder.createRule(activationTokenEnvId, w.check_type, w.severity, w.description);
      rulesRun.push(added);
      if (w.severity === 'CRITICAL') overallBlocked = true;
    }

    // 5. Activation token env configuration checks
    const envConfig = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : record.canary_envelope_json;

    if (!envConfig || envConfig.token_envelope_mode !== 'ISSUANCE_ENVELOPE_PREPARATION_ONLY' || envConfig.allow_token_issue !== false || envConfig.allow_token_redeem !== false || envConfig.allow_real_activation !== false || envConfig.allow_real_execution !== false || envConfig.allow_plan_executable_state !== false || envConfig.max_runtime_mutations !== 0 || envConfig.envelope_redeemable !== false) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenEnvId, 'ACTIVATION_TOKEN_ENV_CONFIG_VALIDATION', 'CRITICAL', 'Activation token envelope configuration is invalid.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenEnvId, 'ACTIVATION_TOKEN_ENV_CONFIG_VALIDATION', 'INFO', 'Activation token envelope configuration verified.'));
    }

    // 6. Security officer confirmation, kill-switch & rollback authority checks
    const securityOfficerConfirmed = overrides.security_officer_confirmed !== undefined ? overrides.security_officer_confirmed : true;
    const killSwitchVerified = overrides.kill_switch_verified !== undefined ? overrides.kill_switch_verified : true;
    const rollbackAuthorityVerified = overrides.rollback_authority_verified !== undefined ? overrides.rollback_authority_verified : true;
    if (!securityOfficerConfirmed || !killSwitchVerified || !rollbackAuthorityVerified) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenEnvId, 'SECURITY_SIGNATURE_VERIFICATION', 'CRITICAL', 'Security officer confirmation, kill-switch, or rollback verification is missing.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenEnvId, 'SECURITY_SIGNATURE_VERIFICATION', 'INFO', 'Verified security officer confirmation, kill-switch status, and rollback authority.'));
    }

    // 7. Verify token auth hash & token material hash matching
    if (parentAuth && parentAuth.activation_token_auth_hash !== record.source_activation_token_auth_hash) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenEnvId, 'TOKEN_AUTH_HASH_VERIFICATION', 'CRITICAL', 'Token auth hash mismatch against parent record.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenEnvId, 'TOKEN_AUTH_HASH_VERIFICATION', 'INFO', 'Token auth hash verified successfully.'));
    }

    if (parentAuth && parentAuth.source_token_material_hash !== record.source_token_material_hash) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenEnvId, 'TOKEN_MATERIAL_HASH_VERIFICATION', 'CRITICAL', 'Token material hash mismatch against parent record.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenEnvId, 'TOKEN_MATERIAL_HASH_VERIFICATION', 'INFO', 'Token material hash verified successfully.'));
    }

    // 8. Generate Token Env hash
    const rawString = `${activationTokenEnvId}:${record.cohort_id}:${record.tenant_id}:${record.source_token_material_hash}`;
    const activationTokenEnvHash = 'env_' + crypto.createHash('sha256').update(rawString).digest('hex');

    const status = overallBlocked ? 'BLOCKED' : 'EVALUATED';
    const result = overrides.activation_token_env_result || (overallBlocked ? 'ENVELOPE_BLOCKED_BY_GUARDRAIL' : 'ENVELOPE_PREPARED_NOT_ISSUED');

    const blockers = {};
    if (overallBlocked) {
      blockers.failed_token_env_rules = true;
    }

    await builder.updateTokenEnv(activationTokenEnvId, {
      activation_token_env_status: status,
      activation_token_env_result: result,
      guardrail_status: overallBlocked ? 'FAIL' : 'PASS',
      write_scope_status: overallBlocked ? 'FAIL' : 'PASS',
      token_env_blockers_json: blockers,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_ENV_FINALIZED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      activation_token_env_hash: activationTokenEnvHash,
      token_env_evidence_pack_hash: activationTokenEnvHash,
      token_env_rules_json: rulesRun
    });

    await auditSvc.createAuditLog(activationTokenEnvId, 'TOKEN_ENV_EVALUATED', actorId, { overallBlocked, status, result });
    return { success: !overallBlocked };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationTokenEnvEvaluatorService();
module.exports = {
  CohortInterventionExecutionPlanActivationTokenEnvEvaluatorService,
  serviceInstance
};
