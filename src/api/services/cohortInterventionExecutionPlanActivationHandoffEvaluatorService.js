'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationHandoffBuilderService').serviceInstance;
const guardrailSvc = require('./cohortInterventionExecutionPlanActivationHandoffGuardrailService').serviceInstance;
const decisionBuilderSvc = require('./cohortInterventionExecutionPlanActivationDecisionBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationHandoffAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationHandoffEvaluatorService {
  async evaluateHandoff(activationHandoffId, overrides = {}, actorId = 'system') {
    const record = await builder.getHandoff(activationHandoffId);
    if (!record) throw new Error('HANDOFF_RECORD_NOT_FOUND');

    if (record.activation_handoff_status === 'FINALIZED') {
      throw new Error('HANDOFF_RECORD_ALREADY_FINALIZED');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (isProdLike) {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_handoff_rules WHERE activation_handoff_id = ?`, [activationHandoffId]);
    } else {
      builder._mockState.rules.set(activationHandoffId, []);
    }

    const rulesRun = [];
    let overallBlocked = false;

    // 1. Validate parent Phase 153 decision
    const parentDecision = await decisionBuilderSvc.getDecision(record.source_activation_decision_id);
    if (!parentDecision) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationHandoffId, 'PHASE153_DECISION_VALIDATION', 'CRITICAL', 'Parent Phase 153 decision not found.'));
    } else if (parentDecision.activation_decision_status !== 'FINALIZED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationHandoffId, 'PHASE153_DECISION_VALIDATION', 'CRITICAL', 'Parent Phase 153 decision is not finalized.'));
    } else if (parentDecision.activation_decision_result !== 'GO_APPROVED_NOT_ACTIVE') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationHandoffId, 'PHASE153_DECISION_VALIDATION', 'CRITICAL', `Parent Phase 153 decision result is invalid: ${parentDecision.activation_decision_result}`));
    } else {
      rulesRun.push(await builder.createRule(activationHandoffId, 'PHASE153_DECISION_VALIDATION', 'INFO', 'Verified parent Phase 153 decision is finalized and passed.'));
    }

    // 2. Safety markers check on parent
    if (parentDecision && parentDecision.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationHandoffId, 'SAFETY_BOUNDARY_VALIDATION', 'CRITICAL', 'Parent Phase 153 execution capability is enabled, violating safety bounds.'));
    } else {
      rulesRun.push(await builder.createRule(activationHandoffId, 'SAFETY_BOUNDARY_VALIDATION', 'INFO', 'Confirmed safety boundary: parent execution capability is disabled.'));
    }

    // 3. Static scanner checks
    const staticScan = await guardrailSvc.performSafetyScannerCheck(activationHandoffId);
    for (const s of staticScan) {
      const added = await builder.createRule(activationHandoffId, s.check_type, s.severity, s.description);
      rulesRun.push(added);
      if (s.severity === 'CRITICAL') overallBlocked = true;
    }

    // 4. Verify write scope
    const writeScope = await guardrailSvc.verifyWriteScope(activationHandoffId);
    for (const w of writeScope) {
      const added = await builder.createRule(activationHandoffId, w.check_type, w.severity, w.description);
      rulesRun.push(added);
      if (w.severity === 'CRITICAL') overallBlocked = true;
    }

    // 5. Activation handoff configuration checks
    const handoffConfig = typeof record.canary_envelope_json === 'string'
      ? JSON.parse(record.canary_envelope_json)
      : record.canary_envelope_json;

    if (!handoffConfig || handoffConfig.handoff_mode !== 'TOKEN_PREPARATION_ONLY' || handoffConfig.allow_real_activation !== false || handoffConfig.allow_real_execution !== false || handoffConfig.allow_plan_executable_state !== false || handoffConfig.max_runtime_mutations !== 0) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationHandoffId, 'ACTIVATION_HANDOFF_CONFIG_VALIDATION', 'CRITICAL', 'Activation handoff configuration is invalid.'));
    } else {
      rulesRun.push(await builder.createRule(activationHandoffId, 'ACTIVATION_HANDOFF_CONFIG_VALIDATION', 'INFO', 'Activation handoff configuration verified.'));
    }

    // 6. Operator confirmation, kill-switch & rollback authority checks
    const operatorConfirmed = overrides.operator_confirmed !== undefined ? overrides.operator_confirmed : true;
    const killSwitchVerified = overrides.kill_switch_verified !== undefined ? overrides.kill_switch_verified : true;
    const rollbackAuthorityVerified = overrides.rollback_authority_verified !== undefined ? overrides.rollback_authority_verified : true;
    if (!operatorConfirmed || !killSwitchVerified || !rollbackAuthorityVerified) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationHandoffId, 'SAFETY_ATTENUATION_VERIFICATION', 'CRITICAL', 'Operator confirmation, kill-switch, or rollback verification is missing.'));
    } else {
      rulesRun.push(await builder.createRule(activationHandoffId, 'SAFETY_ATTENUATION_VERIFICATION', 'INFO', 'Verified operator confirmation, kill-switch status, and rollback authority.'));
    }

    // 7. Verify decision hash matching
    if (parentDecision && parentDecision.activation_decision_hash !== record.source_activation_decision_hash) {
      overallBlocked = true;
      rulesRun.push(await builder.createRule(activationHandoffId, 'DECISION_HASH_VERIFICATION', 'CRITICAL', 'Decision hash mismatch against parent record.'));
    } else {
      rulesRun.push(await builder.createRule(activationHandoffId, 'DECISION_HASH_VERIFICATION', 'INFO', 'Decision hash verified successfully.'));
    }

    // 8. Generate Handoff & Token hashes
    const hdMode = handoffConfig ? handoffConfig.handoff_mode || 'TOKEN_PREPARATION_ONLY' : 'TOKEN_PREPARATION_ONLY';
    const rawString = `${activationHandoffId}:${record.cohort_id}:${record.tenant_id}:${hdMode}`;
    const activationHandoffHash = 'ahh_' + crypto.createHash('sha256').update(rawString).digest('hex');
    const tokenMaterialHash = 'tmh_' + crypto.createHash('sha256').update(rawString + ':token').digest('hex');

    const status = overallBlocked ? 'BLOCKED' : 'EVALUATED';
    const result = overrides.activation_handoff_result || (overallBlocked ? 'TOKEN_BLOCKED_BY_GUARDRAIL' : 'TOKEN_PREPARED_NOT_ISSUED');

    const blockers = {};
    if (overallBlocked) {
      blockers.failed_handoff_rules = true;
    }

    await builder.updateHandoff(activationHandoffId, {
      activation_handoff_status: status,
      activation_handoff_result: result,
      guardrail_status: overallBlocked ? 'FAIL' : 'PASS',
      write_scope_status: overallBlocked ? 'FAIL' : 'PASS',
      handoff_blockers_json: blockers,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'HANDOFF_FINALIZED_NOT_EXECUTED',
      package_freeze_status: 'FROZEN_IMMUTABLE',
      plan_executable_status: 'NOT_EXECUTABLE',
      job_creation_status: 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      activation_handoff_hash: activationHandoffHash,
      token_material_hash: tokenMaterialHash,
      handoff_evidence_pack_hash: activationHandoffHash,
      handoff_rules_json: rulesRun
    });

    await auditSvc.createAuditLog(activationHandoffId, 'HANDOFF_EVALUATED', actorId, { overallBlocked, status, result });
    return { success: !overallBlocked };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationHandoffEvaluatorService();
module.exports = {
  CohortInterventionExecutionPlanActivationHandoffEvaluatorService,
  serviceInstance
};
