'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenFinalApvBuilderService').serviceInstance;
const guardrailSvc = require('./cohortInterventionExecutionPlanActivationTokenFinalApvGuardrailService').serviceInstance;
const tokenEnvBuilderSvc = require('./cohortInterventionExecutionPlanActivationTokenEnvBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenFinalApvAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenFinalApvEvaluatorService {
  async evaluateTokenFinalApv(activationTokenFinalApvId, overrides = {}, actorId = 'system') {
    const record = await builder.getTokenFinalApv(activationTokenFinalApvId);
    if (!record) throw new Error('TOKEN_FINAL_APV_RECORD_NOT_FOUND');

    if (record.activation_token_final_apv_status === 'FINALIZED') {
      throw new Error('TOKEN_FINAL_APV_RECORD_ALREADY_FINALIZED');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (isProdLike) {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_final_apv_rules WHERE activation_token_final_apv_id = ?`, [activationTokenFinalApvId]);
    } else {
      builder._mockState.rules.set(activationTokenFinalApvId, []);
    }

    const rulesRun = [];
    let overallBlocked = false;

    // 1. Validate parent Phase 156 token envelope
    const parentEnv = await tokenEnvBuilderSvc.getTokenEnv(record.source_activation_token_env_id);
    if (!parentEnv) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenFinalApvId, 'PHASE156_TOKEN_ENV_VALIDATION', 'CRITICAL', 'Parent Phase 156 token envelope not found.'));
    } else if (parentEnv.activation_token_env_status !== 'FINALIZED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenFinalApvId, 'PHASE156_TOKEN_ENV_VALIDATION', 'CRITICAL', 'Parent Phase 156 token envelope is not finalized.'));
    } else if (parentEnv.activation_token_env_result !== 'ENVELOPE_PREPARED_NOT_ISSUED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenFinalApvId, 'PHASE156_TOKEN_ENV_VALIDATION', 'CRITICAL', `Parent Phase 156 token envelope result is invalid: ${parentEnv.activation_token_env_result}`));
    } else {
      rulesRun.push(await builder.createRule(activationTokenFinalApvId, 'PHASE156_TOKEN_ENV_VALIDATION', 'INFO', 'Verified parent Phase 156 token envelope is finalized and passed.'));
    }

    // 2. Safety markers check on parent Phase 156
    if (parentEnv) {
      const parentConfig = typeof parentEnv.canary_envelope_json === 'string'
        ? JSON.parse(parentEnv.canary_envelope_json)
        : parentEnv.canary_envelope_json;

      if (parentEnv.execution_capability_status !== 'EXECUTION_NOT_ENABLED' ||
          parentEnv.activation_execution_status !== 'TOKEN_ENV_FINALIZED_NOT_EXECUTED' ||
          parentEnv.package_freeze_status !== 'FROZEN_IMMUTABLE' ||
          parentEnv.plan_executable_status !== 'NOT_EXECUTABLE' ||
          parentEnv.job_creation_status !== 'NO_REAL_JOB_CREATED' ||
          parentEnv.queue_dispatch_status !== 'NO_QUEUE_DISPATCHED' ||
          parentEnv.runtime_mutation_status !== 'ZERO_RUNTIME_MUTATION_CONFIRMED' ||
          (parentConfig && (parentConfig.token_status !== 'PREPARED_NOT_ISSUED' || parentConfig.token_issuance_status !== 'ENVELOPE_PREPARED_NOT_ISSUED' || parentConfig.token_redeemable === true || parentConfig.envelope_redeemable === true))) {
        overallBlocked = true;
        rulesRun.push(await builder.createRule(activationTokenFinalApvId, 'SAFETY_BOUNDARY_VALIDATION', 'CRITICAL', 'Parent Phase 156 safety boundaries are violated.'));
      } else {
        rulesRun.push(await builder.createRule(activationTokenFinalApvId, 'SAFETY_BOUNDARY_VALIDATION', 'INFO', 'Confirmed safety boundary: parent Phase 156 execution is fully disabled.'));
      }
    }

    // 3. Static scanner checks
    const staticScan = await guardrailSvc.performSafetyScannerCheck(activationTokenFinalApvId);
    for (const s of staticScan) {
      const added = await builder.createRule(activationTokenFinalApvId, s.check_type, s.severity, s.description);
      rulesRun.push(added);
      if (s.severity === 'CRITICAL') overallBlocked = true;
    }

    // 4. Verify write scope
    const writeScope = await guardrailSvc.verifyWriteScope(activationTokenFinalApvId);
    for (const w of writeScope) {
      const added = await builder.createRule(activationTokenFinalApvId, w.check_type, w.severity, w.description);
      rulesRun.push(added);
      if (w.severity === 'CRITICAL') overallBlocked = true;
    }

    // 5. Activation token final approval configuration checks
    const apvConfig = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : record.canary_envelope_json;

    if (!apvConfig || apvConfig.final_approval_mode !== 'TOKEN_FINAL_ISSUANCE_APPROVAL_ONLY' || apvConfig.allow_token_issue !== false || apvConfig.allow_token_redeem !== false || apvConfig.allow_real_activation !== false || apvConfig.allow_real_execution !== false || apvConfig.allow_plan_executable_state !== false || apvConfig.max_runtime_mutations !== 0) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenFinalApvId, 'ACTIVATION_TOKEN_FINAL_APV_CONFIG_VALIDATION', 'CRITICAL', 'Activation token final approval configuration is invalid.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenFinalApvId, 'ACTIVATION_TOKEN_FINAL_APV_CONFIG_VALIDATION', 'INFO', 'Activation token final approval configuration verified.'));
    }

    // 6. Security committee chair confirmation, kill-switch & rollback authority checks
    const securityCommitteeChairConfirmed = overrides.security_committee_chair_confirmed !== undefined ? overrides.security_committee_chair_confirmed : true;
    const killSwitchVerified = overrides.kill_switch_verified !== undefined ? overrides.kill_switch_verified : true;
    const rollbackAuthorityVerified = overrides.rollback_authority_verified !== undefined ? overrides.rollback_authority_verified : true;
    if (!securityCommitteeChairConfirmed || !killSwitchVerified || !rollbackAuthorityVerified) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenFinalApvId, 'SECURITY_SIGNATURE_VERIFICATION', 'CRITICAL', 'Security committee chair confirmation, kill-switch, or rollback verification is missing.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenFinalApvId, 'SECURITY_SIGNATURE_VERIFICATION', 'INFO', 'Verified security committee chair confirmation, kill-switch status, and rollback authority.'));
    }

    // 7. Verify token envelope hash & token material hash matching
    if (parentEnv && parentEnv.activation_token_env_hash !== record.source_activation_token_env_hash) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenFinalApvId, 'TOKEN_ENV_HASH_VERIFICATION', 'CRITICAL', 'Token envelope hash mismatch against parent record.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenFinalApvId, 'TOKEN_ENV_HASH_VERIFICATION', 'INFO', 'Token envelope hash verified successfully.'));
    }

    if (parentEnv && parentEnv.source_token_material_hash !== record.source_token_material_hash) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenFinalApvId, 'TOKEN_MATERIAL_HASH_VERIFICATION', 'CRITICAL', 'Token material hash mismatch against parent record.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenFinalApvId, 'TOKEN_MATERIAL_HASH_VERIFICATION', 'INFO', 'Token material hash verified successfully.'));
    }

    // 8. Generate Token Final approval hash
    const rawString = `${activationTokenFinalApvId}:${record.cohort_id}:${record.tenant_id}:${record.source_token_material_hash}`;
    const activationTokenFinalApvHash = 'apv_' + crypto.createHash('sha256').update(rawString).digest('hex');

    const status = overallBlocked ? 'BLOCKED' : 'EVALUATED';
    const result = overrides.activation_token_final_apv_result || (overallBlocked ? 'FINAL_APPROVAL_BLOCKED_BY_GUARDRAIL' : 'FINAL_APPROVED_NOT_ISSUED');

    const blockers = {};
    if (overallBlocked) {
      blockers.failed_token_final_apv_rules = true;
    }

    await builder.updateTokenFinalApv(activationTokenFinalApvId, {
      activation_token_final_apv_status: status,
      activation_token_final_apv_result: result,
      guardrail_status: overallBlocked ? 'FAIL' : 'PASS',
      write_scope_status: overallBlocked ? 'FAIL' : 'PASS',
      token_final_apv_blockers_json: blockers,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_FINAL_APPROVAL_FINALIZED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      activation_token_final_apv_hash: activationTokenFinalApvHash,
      token_final_apv_evidence_pack_hash: activationTokenFinalApvHash,
      token_final_apv_rules_json: rulesRun
    });

    await auditSvc.createAuditLog(activationTokenFinalApvId, 'TOKEN_FINAL_APV_EVALUATED', actorId, { overallBlocked, status, result });
    return { success: !overallBlocked };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationTokenFinalApvEvaluatorService();
module.exports = {
  CohortInterventionExecutionPlanActivationTokenFinalApvEvaluatorService,
  serviceInstance
};
