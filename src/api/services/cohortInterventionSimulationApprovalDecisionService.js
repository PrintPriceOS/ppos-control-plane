'use strict';

const db = require('./mysqlClient');
const approvalBuilderSvc = require('./cohortInterventionSimulationApprovalBuilderService').serviceInstance || require('./cohortInterventionSimulationApprovalBuilderService');
const prepBuilderSvc = require('./cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('./cohortInterventionSimulationApprovalPreparationBuilderService');
const evaluatorSvc = require('./cohortInterventionSimulationApprovalEvaluatorService').serviceInstance || require('./cohortInterventionSimulationApprovalEvaluatorService');
const guardrailSvc = require('./cohortInterventionSimulationApprovalGuardrailService').serviceInstance || require('./cohortInterventionSimulationApprovalGuardrailService');
const auditService = require('./cohortInterventionSimulationApprovalAuditService').serviceInstance || require('./cohortInterventionSimulationApprovalAuditService');

class CohortInterventionSimulationApprovalDecisionService {
  constructor() {
    this._mockState = {};
  }

  async recordDecision(approvalId, decisionValue, rationale, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const approval = await approvalBuilderSvc.getApproval(approvalId);
    if (!approval) throw new Error('APPROVAL_NOT_FOUND');

    if (approval.approval_status === 'FINALIZED' || approval.approval_status === 'SUPERSEDED') {
      throw new Error(`APPROVAL_ALREADY_FINALIZED: Status is ${approval.approval_status}`);
    }

    if (!rationale || rationale.trim().length === 0) {
      throw new Error('RATIONALE_REQUIRED');
    }

    // Call evaluator to perform mapping and updates
    await evaluatorSvc.evaluateApproval(approvalId, actorId, {
      approval_decision: decisionValue
    });

    let newStatus = 'READY_FOR_DECISION';
    if (decisionValue === 'APPROVE_HIGH_RISK_COHORT_PAUSE' || 
        decisionValue === 'APPROVE_HIGH_RISK_PARTICIPANT_RESTRICTION' || 
        decisionValue === 'APPROVE_HIGH_RISK_INVITE_REVOCATION' || 
        decisionValue === 'APPROVE_HIGH_RISK_CONTROLLED_EXPANSION') {
      newStatus = 'APPROVED';
    } else if (decisionValue === 'REJECT_HIGH_RISK_INTERVENTION') {
      newStatus = 'REJECTED';
    } else if (decisionValue === 'BLOCK_HIGH_RISK_INTERVENTION') {
      newStatus = 'BLOCKED';
    } else if (decisionValue === 'REQUEST_RE_PREPARATION') {
      newStatus = 'DRAFT'; // resets back
    } else if (decisionValue === 'REQUEST_RE_SIMULATION') {
      newStatus = 'DRAFT';
    } else if (decisionValue === 'ESCALATE_TO_GOVERNANCE_OWNER') {
      newStatus = 'ESCALATED';
    }

    if (!isProdLike) {
      const record = approvalBuilderSvc._mockState.approvals.get(approvalId);
      record.approval_status = newStatus;
      record.approved_by = actorId;
      record.approved_at = new Date();
      record.approval_summary_json = { ...record.approval_summary_json, rationale };
      approvalBuilderSvc._mockState.approvals.set(approvalId, record);
    } else {
      await db.query(
        `UPDATE controlled_beta_cohort_intervention_approvals
         SET approval_status = ?,
             approved_by = ?,
             approved_at = NOW(),
             approval_summary_json = JSON_SET(COALESCE(approval_summary_json, '{}'), '$.rationale', ?)
         WHERE approval_id = ?`,
        [newStatus, actorId, rationale, approvalId]
      );
    }

    await auditService.recordAuditEvent(approvalId, 'APPROVAL_DECISION_RECORDED', actorId, {
      decision: decisionValue,
      status: newStatus,
      rationale
    });

    const updated = await approvalBuilderSvc.getApproval(approvalId);
    return { approval: updated };
  }

  async finalizeApproval(approvalId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Load approval
    const approval = await approvalBuilderSvc.getApproval(approvalId);
    if (!approval) throw new Error('APPROVAL_NOT_FOUND');

    if (approval.approval_status === 'FINALIZED' || approval.approval_status === 'SUPERSEDED') {
      throw new Error(`APPROVAL_ALREADY_FINALIZED: Status is ${approval.approval_status}`);
    }

    // 2. Fetch source Phase 143 prep
    const prep = await prepBuilderSvc.getPrep(approval.source_prep_id);
    if (!prep) throw new Error('PHASE143_PREPARATION_NOT_FOUND');
    if (prep.prep_status !== 'FINALIZED') {
      throw new Error('PHASE143_PREPARATION_NOT_FINALIZED');
    }
    if (prep.execution_capability_status !== 'EXECUTION_NOT_ENABLED') {
      throw new Error('PHASE143_EXECUTION_CAPABILITY_VIOLATION');
    }
    if (prep.approval_execution_status !== 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY') {
      throw new Error('PHASE143_APPROVAL_EXECUTION_STATUS_VIOLATION');
    }

    // 3. Validate evaluation completed
    if (approval.approval_status === 'DRAFT' || approval.approval_status === 'READY_FOR_EVALUATION') {
      throw new Error('EVALUATION_NOT_COMPLETED');
    }

    // 4. Validate approval decision and rationale present
    if (!approval.approval_decision) {
      throw new Error('DECISION_REQUIRED_BEFORE_FINALIZATION');
    }
    const summary = typeof approval.approval_summary_json === 'string'
      ? JSON.parse(approval.approval_summary_json)
      : approval.approval_summary_json;
    if (!summary || !summary.rationale) {
      throw new Error('RATIONALE_REQUIRED_BEFORE_FINALIZATION');
    }

    // 5. Validate evidence pack generated
    if (!approval.evidence_pack_hash) {
      throw new Error('EVIDENCE_PACK_HASH_MISSING');
    }

    // 6. Validate write-scope attestation
    const writeScope = typeof approval.write_scope_attestation_json === 'string'
      ? JSON.parse(approval.write_scope_attestation_json)
      : approval.write_scope_attestation_json;
    if (writeScope.writes_only_phase144_tables !== true || writeScope.wrote_phase128_to_143_operational_tables !== false) {
      throw new Error('WRITE_SCOPE_ATTESTATION_VIOLATION');
    }

    // 7. Validate guardrails
    const guardrailCheck = await guardrailSvc.runGuardrailCheck(approvalId);
    if (guardrailCheck.status !== 'PASS') {
      throw new Error('GUARDRAIL_VIOLATION_BLOCKED_FINALIZATION');
    }

    // 8. Update status to FINALIZED
    if (!isProdLike) {
      const record = approvalBuilderSvc._mockState.approvals.get(approvalId);
      record.approval_status = 'FINALIZED';
      record.finalized_by = actorId;
      record.finalized_at = new Date();
      approvalBuilderSvc._mockState.approvals.set(approvalId, record);
    } else {
      await db.query(
        `UPDATE controlled_beta_cohort_intervention_approvals
         SET approval_status = 'FINALIZED',
             finalized_by = ?,
             finalized_at = NOW()
         WHERE approval_id = ?`,
        [actorId, approvalId]
      );
    }

    await auditService.recordAuditEvent(approvalId, 'APPROVAL_FINALIZED', actorId);

    const updated = await approvalBuilderSvc.getApproval(approvalId);
    return { approval: updated };
  }
}

const serviceInstance = new CohortInterventionSimulationApprovalDecisionService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationApprovalDecisionService = CohortInterventionSimulationApprovalDecisionService;
