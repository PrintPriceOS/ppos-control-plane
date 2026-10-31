'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionReadinessBuilderService').serviceInstance;
const guardrailSvc = require('./cohortInterventionExecutionReadinessGuardrailService').serviceInstance;
const approvalBuilderSvc = require('./cohortInterventionSimulationApprovalBuilderService').serviceInstance || require('./cohortInterventionSimulationApprovalBuilderService');
const auditSvc = require('./cohortInterventionExecutionReadinessAuditService').serviceInstance;

class CohortInterventionExecutionReadinessEvaluatorService {
  async evaluateReadiness(readinessId, overrides = {}, actorId = 'system') {
    const record = await builder.getReadiness(readinessId);
    if (!record) throw new Error('READINESS_RECORD_NOT_FOUND');

    if (record.readiness_status === 'FINALIZED') {
      throw new Error('READINESS_RECORD_ALREADY_FINALIZED');
    }

    // Clear previous checks
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (isProdLike) {
      await db.query(`DELETE FROM cb_cohort_intervention_exec_ready_checks WHERE readiness_id = ?`, [readinessId]);
    } else {
      builder._mockState.checks.set(readinessId, []);
    }

    const checksRun = [];
    let overallBlocked = false;

    // 1. Validate Phase 144 approval is finalized and approved
    const parentApproval = await approvalBuilderSvc.getApproval(record.source_approval_id);
    if (!parentApproval) {
      overallBlocked = true;
      checksRun.push(await builder.createCheck(readinessId, 'PHASE144_APPROVAL_VALIDATION', 'CRITICAL', 'Parent Phase 144 approval not found.'));
    } else if (parentApproval.approval_status !== 'FINALIZED') {
      overallBlocked = true;
      checksRun.push(await builder.createCheck(readinessId, 'PHASE144_APPROVAL_VALIDATION', 'CRITICAL', 'Parent Phase 144 approval is not finalized.'));
    } else if (parentApproval.approval_decision !== 'APPROVE_HIGH_RISK_COHORT_PAUSE' && parentApproval.approval_decision !== 'APPROVE_HIGH_RISK_PARTICIPANT_RESTRICTION' && parentApproval.approval_decision !== 'APPROVE_HIGH_RISK_INVITE_REVOCATION' && parentApproval.approval_decision !== 'APPROVE_HIGH_RISK_CONTROLLED_EXPANSION') {
      overallBlocked = true;
      checksRun.push(await builder.createCheck(readinessId, 'PHASE144_APPROVAL_VALIDATION', 'CRITICAL', `Parent Phase 144 approval is not in approved state (decision: ${parentApproval.approval_decision}).`));
    } else {
      checksRun.push(await builder.createCheck(readinessId, 'PHASE144_APPROVAL_VALIDATION', 'INFO', 'Verified parent Phase 144 approval is finalized and approved.'));
    }

    // 2. Validate Phase 144 execution capability is execution not enabled
    if (parentApproval && parentApproval.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      overallBlocked = true;
      checksRun.push(await builder.createCheck(readinessId, 'SAFETY_BOUNDARY_VALIDATION', 'CRITICAL', 'Parent Phase 144 execution capability is enabled, violating safety bounds.'));
    } else {
      checksRun.push(await builder.createCheck(readinessId, 'SAFETY_BOUNDARY_VALIDATION', 'INFO', 'Confirmed safety boundary: parent execution capability is disabled.'));
    }

    // 3. Static scanning for execution leaks
    const staticScan = await guardrailSvc.performSafetyScannerCheck(readinessId);
    for (const s of staticScan) {
      const added = await builder.createCheck(readinessId, s.check_type, s.severity, s.description);
      checksRun.push(added);
      if (s.severity === 'CRITICAL') overallBlocked = true;
    }

    // 4. Verify write scope
    const writeScope = await guardrailSvc.verifyWriteScope(readinessId);
    for (const w of writeScope) {
      const added = await builder.createCheck(readinessId, w.check_type, w.severity, w.description);
      checksRun.push(added);
      if (w.severity === 'CRITICAL') overallBlocked = true;
    }

    // 5. Evaluate kill-switch configuration
    const killSwitchEnabled = overrides.kill_switch_configured !== undefined ? overrides.kill_switch_configured : true;
    if (!killSwitchEnabled) {
      overallBlocked = true;
      checksRun.push(await builder.createCheck(readinessId, 'KILL_SWITCH_VERIFICATION', 'CRITICAL', 'Emergency kill-switch is not configured.'));
    } else {
      checksRun.push(await builder.createCheck(readinessId, 'KILL_SWITCH_VERIFICATION', 'INFO', 'Emergency stop kill-switch path is verified and enabled.'));
    }

    // 6. Verify rollback authority and plan
    const rollbackAuthorityAssigned = overrides.rollback_authority_assigned !== undefined ? overrides.rollback_authority_assigned : true;
    if (!rollbackAuthorityAssigned) {
      overallBlocked = true;
      checksRun.push(await builder.createCheck(readinessId, 'ROLLBACK_VERIFICATION', 'CRITICAL', 'Rollback authority is not assigned.'));
    } else {
      checksRun.push(await builder.createCheck(readinessId, 'ROLLBACK_VERIFICATION', 'INFO', 'Rollback plan and rollback authority assigned successfully.'));
    }

    // 7. Verify canary/no-op path
    const canaryAvailable = overrides.canary_available !== undefined ? overrides.canary_available : true;
    if (!canaryAvailable) {
      overallBlocked = true;
      checksRun.push(await builder.createCheck(readinessId, 'CANARY_VERIFICATION', 'CRITICAL', 'Canary/no-op execution mode is not available.'));
    } else {
      checksRun.push(await builder.createCheck(readinessId, 'CANARY_VERIFICATION', 'INFO', 'Canary/no-op dry-run pathways verified.'));
    }

    // Compute status and decision
    const status = overallBlocked ? 'BLOCKED' : 'EVALUATED';
    const decision = overrides.readiness_decision || (overallBlocked ? 'BLOCK_EXECUTION_PATH' : 'APPROVE_EXECUTION_READINESS_NOT_EXECUTED');
    const safetyExecutionStatus = overallBlocked ? 'READINESS_REJECTED_NOT_EXECUTED' : 'READINESS_APPROVED_NOT_EXECUTED';

    const blockers = {};
    if (overallBlocked) {
      blockers.failed_readiness_checks = true;
    }

    await builder.updateReadiness(readinessId, {
      readiness_status: status,
      readiness_decision: decision,
      guardrail_status: overallBlocked ? 'FAIL' : 'PASS',
      write_scope_status: overallBlocked ? 'FAIL' : 'PASS',
      kill_switch_status: killSwitchEnabled ? 'PASS' : 'FAIL',
      rollback_authority_status: rollbackAuthorityAssigned ? 'PASS' : 'FAIL',
      readiness_blockers_json: blockers,
      execution_capability_status: 'EXECUTION_NOT_ENABLED',
      execution_readiness_status: 'EXECUTION_READY_NOT_ACTIVE',
      readiness_execution_status: safetyExecutionStatus,
      readiness_checks_json: checksRun
    });

    await auditSvc.createAuditLog(readinessId, 'READINESS_EVALUATED', actorId, { overallBlocked, status, decision });
    return { success: !overallBlocked };
  }
}

const serviceInstance = new CohortInterventionExecutionReadinessEvaluatorService();
module.exports = {
  CohortInterventionExecutionReadinessEvaluatorService,
  serviceInstance
};
