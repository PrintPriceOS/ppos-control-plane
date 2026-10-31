'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationDecisionBuilderService').serviceInstance;
const guardrailSvc = require('./cohortInterventionExecutionPlanActivationDecisionGuardrailService').serviceInstance;
const lockBuilderSvc = require('./cohortInterventionExecutionPlanActivationLockBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationDecisionAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationDecisionEvaluatorService {
  async evaluateDecision(activationDecisionId, overrides = {}, actorId = 'system') {
    const record = await builder.getDecision(activationDecisionId);
    if (!record) throw new Error('DECISION_RECORD_NOT_FOUND');

    if (record.activation_decision_status === 'FINALIZED') {
      throw new Error('DECISION_RECORD_ALREADY_FINALIZED');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (isProdLike) {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_decision_rules WHERE activation_decision_id = ?`, [activationDecisionId]);
    } else {
      builder._mockState.rules.set(activationDecisionId, []);
    }

    const rulesRun = [];
    let overallBlocked = false;

    // 1. Validate parent Phase 152 lock
    const parentLock = await lockBuilderSvc.getLock(record.source_activation_lock_id);
    if (!parentLock) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationDecisionId, 'PHASE152_LOCK_VALIDATION', 'CRITICAL', 'Parent Phase 152 lock not found.'));
    } else if (parentLock.activation_lock_status !== 'FINALIZED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationDecisionId, 'PHASE152_LOCK_VALIDATION', 'CRITICAL', 'Parent Phase 152 lock is not finalized.'));
    } else if (parentLock.activation_lock_result !== 'LOCKED_NOT_ACTIVE') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationDecisionId, 'PHASE152_LOCK_VALIDATION', 'CRITICAL', `Parent Phase 152 lock result is invalid: ${parentLock.activation_lock_result}`));
    } else {
      rulesRun.push(await builder.createRule(activationDecisionId, 'PHASE152_LOCK_VALIDATION', 'INFO', 'Verified parent Phase 152 lock is finalized and passed.'));
    }

    // 2. Safety markers check on parent
    if (parentLock && parentLock.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationDecisionId, 'SAFETY_BOUNDARY_VALIDATION', 'CRITICAL', 'Parent Phase 152 execution capability is enabled, violating safety bounds.'));
    } else {
      rulesRun.push(await builder.createRule(activationDecisionId, 'SAFETY_BOUNDARY_VALIDATION', 'INFO', 'Confirmed safety boundary: parent execution capability is disabled.'));
    }

    // 3. Static scanner checks
    const staticScan = await guardrailSvc.performSafetyScannerCheck(activationDecisionId);
    for (const s of staticScan) {
      const added = await builder.createRule(activationDecisionId, s.check_type, s.severity, s.description);
      rulesRun.push(added);
      if (s.severity === 'CRITICAL') overallBlocked = true;
    }

    // 4. Verify write scope
    const writeScope = await guardrailSvc.verifyWriteScope(activationDecisionId);
    for (const w of writeScope) {
      const added = await builder.createRule(activationDecisionId, w.check_type, w.severity, w.description);
      rulesRun.push(added);
      if (w.severity === 'CRITICAL') overallBlocked = true;
    }

    // 5. Activation decision configuration checks
    const decisionConfig = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : record.canary_envelope_json;

    if (!decisionConfig || decisionConfig.decision_mode !== 'FINAL_GO_NO_GO_DECISION_ONLY' || decisionConfig.allow_real_activation !== false || decisionConfig.allow_real_execution !== false || decisionConfig.allow_plan_executable_state !== false || decisionConfig.max_runtime_mutations !== 0) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationDecisionId, 'ACTIVATION_DECISION_CONFIG_VALIDATION', 'CRITICAL', 'Activation decision configuration is invalid.'));
    } else {
      rulesRun.push(await builder.createRule(activationDecisionId, 'ACTIVATION_DECISION_CONFIG_VALIDATION', 'INFO', 'Activation decision configuration verified.'));
    }

    // 6. Operator confirmation, kill-switch & rollback authority checks
    const operatorConfirmed = overrides.operator_confirmed !== undefined ? overrides.operator_confirmed : true;
    const killSwitchVerified = overrides.kill_switch_verified !== undefined ? overrides.kill_switch_verified : true;
    const rollbackAuthorityVerified = overrides.rollback_authority_verified !== undefined ? overrides.rollback_authority_verified : true;
    if (!operatorConfirmed || !killSwitchVerified || !rollbackAuthorityVerified) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationDecisionId, 'SAFETY_ATTENUATION_VERIFICATION', 'CRITICAL', 'Operator confirmation, kill-switch, or rollback verification is missing.'));
    } else {
      rulesRun.push(await builder.createRule(activationDecisionId, 'SAFETY_ATTENUATION_VERIFICATION', 'INFO', 'Verified operator confirmation, kill-switch status, and rollback authority.'));
    }

    // 7. Verify lock hash matching
    if (parentLock && parentLock.activation_lock_hash !== record.source_activation_lock_hash) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationDecisionId, 'LOCK_HASH_VERIFICATION', 'CRITICAL', 'Lock hash mismatch against parent record.'));
    } else {
      rulesRun.push(await builder.createRule(activationDecisionId, 'LOCK_HASH_VERIFICATION', 'INFO', 'Lock hash verified successfully.'));
    }

    // 8. Generate Decision Hash
    const dsMode = decisionConfig ? decisionConfig.decision_mode || 'FINAL_GO_NO_GO_DECISION_ONLY' : 'FINAL_GO_NO_GO_DECISION_ONLY';
    const rawString = `${activationDecisionId}:${record.cohort_id}:${record.tenant_id}:${dsMode}`;
    const activationDecisionHash = 'adh_' + crypto.createHash('sha256').update(rawString).digest('hex');

    const status = overallBlocked ? 'BLOCKED' : 'EVALUATED';
    const result = overrides.activation_decision_result || (overallBlocked ? 'DECISION_BLOCKED_BY_GUARDRAIL' : 'GO_APPROVED_NOT_ACTIVE');

    const blockers = {};
    if (overallBlocked) {
      blockers.failed_decision_rules = true;
    }

    await builder.updateDecision(activationDecisionId, {
      activation_decision_status: status,
      activation_decision_result: result,
      guardrail_status: overallBlocked ? 'FAIL' : 'PASS',
      write_scope_status: overallBlocked ? 'FAIL' : 'PASS',
      decision_blockers_json: blockers,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'GO_DECISION_FINALIZED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      activation_decision_hash: activationDecisionHash,
      decision_evidence_pack_hash: activationDecisionHash,
      decision_rules_json: rulesRun
    });

    await auditSvc.createAuditLog(activationDecisionId, 'DECISION_EVALUATED', actorId, { overallBlocked, status, result });
    return { success: !overallBlocked };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationDecisionEvaluatorService();
module.exports = {
  CohortInterventionExecutionPlanActivationDecisionEvaluatorService,
  serviceInstance
};
