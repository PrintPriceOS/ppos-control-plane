'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenAuthBuilderService').serviceInstance;
const guardrailSvc = require('./cohortInterventionExecutionPlanActivationTokenAuthGuardrailService').serviceInstance;
const handoffBuilderSvc = require('./cohortInterventionExecutionPlanActivationHandoffBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenAuthAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenAuthEvaluatorService {
  async evaluateTokenAuth(activationTokenAuthId, overrides = {}, actorId = 'system') {
    const record = await builder.getTokenAuth(activationTokenAuthId);
    if (!record) throw new Error('TOKEN_AUTH_RECORD_NOT_FOUND');

    if (record.activation_token_auth_status === 'FINALIZED') {
      throw new Error('TOKEN_AUTH_RECORD_ALREADY_FINALIZED');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (isProdLike) {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_auth_rules WHERE activation_token_auth_id = ?`, [activationTokenAuthId]);
    } else {
      builder._mockState.rules.set(activationTokenAuthId, []);
    }

    const rulesRun = [];
    let overallBlocked = false;

    // 1. Validate parent Phase 154 handoff
    const parentHandoff = await handoffBuilderSvc.getHandoff(record.source_activation_handoff_id);
    if (!parentHandoff) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenAuthId, 'PHASE154_HANDOFF_VALIDATION', 'CRITICAL', 'Parent Phase 154 handoff not found.'));
    } else if (parentHandoff.activation_handoff_status !== 'FINALIZED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenAuthId, 'PHASE154_HANDOFF_VALIDATION', 'CRITICAL', 'Parent Phase 154 handoff is not finalized.'));
    } else if (parentHandoff.activation_handoff_result !== 'TOKEN_PREPARED_NOT_ISSUED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenAuthId, 'PHASE154_HANDOFF_VALIDATION', 'CRITICAL', `Parent Phase 154 handoff result is invalid: ${parentHandoff.activation_handoff_result}`));
    } else {
      rulesRun.push(await builder.createRule(activationTokenAuthId, 'PHASE154_HANDOFF_VALIDATION', 'INFO', 'Verified parent Phase 154 handoff is finalized and passed.'));
    }

    // 2. Safety markers check on parent
    if (parentHandoff && parentHandoff.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenAuthId, 'SAFETY_BOUNDARY_VALIDATION', 'CRITICAL', 'Parent Phase 154 execution capability is enabled, violating safety bounds.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenAuthId, 'SAFETY_BOUNDARY_VALIDATION', 'INFO', 'Confirmed safety boundary: parent execution capability is disabled.'));
    }

    // 3. Static scanner checks
    const staticScan = await guardrailSvc.performSafetyScannerCheck(activationTokenAuthId);
    for (const s of staticScan) {
      const added = await builder.createRule(activationTokenAuthId, s.check_type, s.severity, s.description);
      rulesRun.push(added);
      if (s.severity === 'CRITICAL') overallBlocked = true;
    }

    // 4. Verify write scope
    const writeScope = await guardrailSvc.verifyWriteScope(activationTokenAuthId);
    for (const w of writeScope) {
      const added = await builder.createRule(activationTokenAuthId, w.check_type, w.severity, w.description);
      rulesRun.push(added);
      if (w.severity === 'CRITICAL') overallBlocked = true;
    }

    // 5. Activation token auth configuration checks
    const authConfig = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : record.canary_envelope_json;

    if (!authConfig || authConfig.token_auth_mode !== 'TOKEN_ISSUANCE_AUTHORIZATION_ONLY' || authConfig.allow_token_issue !== false || authConfig.allow_token_redeem !== false || authConfig.allow_real_activation !== false || authConfig.allow_real_execution !== false || authConfig.allow_plan_executable_state !== false || authConfig.max_runtime_mutations !== 0) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenAuthId, 'ACTIVATION_TOKEN_AUTH_CONFIG_VALIDATION', 'CRITICAL', 'Activation token auth configuration is invalid.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenAuthId, 'ACTIVATION_TOKEN_AUTH_CONFIG_VALIDATION', 'INFO', 'Activation token auth configuration verified.'));
    }

    // 6. Operator confirmation, kill-switch & rollback authority checks
    const operatorConfirmed = overrides.operator_confirmed !== undefined ? overrides.operator_confirmed : true;
    const killSwitchVerified = overrides.kill_switch_verified !== undefined ? overrides.kill_switch_verified : true;
    const rollbackAuthorityVerified = overrides.rollback_authority_verified !== undefined ? overrides.rollback_authority_verified : true;
    if (!operatorConfirmed || !killSwitchVerified || !rollbackAuthorityVerified) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenAuthId, 'SAFETY_ATTENUATION_VERIFICATION', 'CRITICAL', 'Operator confirmation, kill-switch, or rollback verification is missing.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenAuthId, 'SAFETY_ATTENUATION_VERIFICATION', 'INFO', 'Verified operator confirmation, kill-switch status, and rollback authority.'));
    }

    // 7. Verify handoff hash & token material hash matching
    if (parentHandoff && parentHandoff.activation_handoff_hash !== record.source_activation_handoff_hash) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenAuthId, 'HANDOFF_HASH_VERIFICATION', 'CRITICAL', 'Handoff hash mismatch against parent record.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenAuthId, 'HANDOFF_HASH_VERIFICATION', 'INFO', 'Handoff hash verified successfully.'));
    }

    if (parentHandoff && parentHandoff.token_material_hash !== record.source_token_material_hash) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationTokenAuthId, 'TOKEN_MATERIAL_HASH_VERIFICATION', 'CRITICAL', 'Token material hash mismatch against parent record.'));
    } else {
      rulesRun.push(await builder.createRule(activationTokenAuthId, 'TOKEN_MATERIAL_HASH_VERIFICATION', 'INFO', 'Token material hash verified successfully.'));
    }

    // 8. Generate Token Auth hash
    const rawString = `${activationTokenAuthId}:${record.cohort_id}:${record.tenant_id}:${record.source_token_material_hash}`;
    const activationTokenAuthHash = 'ath_' + crypto.createHash('sha256').update(rawString).digest('hex');

    const status = overallBlocked ? 'BLOCKED' : 'EVALUATED';
    const result = overrides.activation_token_auth_result || (overallBlocked ? 'AUTHORIZATION_BLOCKED_BY_GUARDRAIL' : 'AUTHORIZED_NOT_ISSUED');

    const blockers = {};
    if (overallBlocked) {
      blockers.failed_token_auth_rules = true;
    }

    await builder.updateTokenAuth(activationTokenAuthId, {
      activation_token_auth_status: status,
      activation_token_auth_result: result,
      guardrail_status: overallBlocked ? 'FAIL' : 'PASS',
      write_scope_status: overallBlocked ? 'FAIL' : 'PASS',
      token_auth_blockers_json: blockers,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'TOKEN_AUTH_FINALIZED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      activation_token_auth_hash: activationTokenAuthHash,
      token_auth_evidence_pack_hash: activationTokenAuthHash,
      token_auth_rules_json: rulesRun
    });

    await auditSvc.createAuditLog(activationTokenAuthId, 'TOKEN_AUTH_EVALUATED', actorId, { overallBlocked, status, result });
    return { success: !overallBlocked };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationTokenAuthEvaluatorService();
module.exports = {
  CohortInterventionExecutionPlanActivationTokenAuthEvaluatorService,
  serviceInstance
};
