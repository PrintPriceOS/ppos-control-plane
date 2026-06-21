'use strict';

const db = require('./mysqlClient');
const builderService = require('./cohortInterventionApprovalBuilderService').serviceInstance || require('./cohortInterventionApprovalBuilderService');
const auditService = require('./cohortInterventionApprovalAuditService').serviceInstance || require('./cohortInterventionApprovalAuditService');

class CohortInterventionApprovalDecisionService {
  async recordDecision(approvalId, decision, rationale, actorId) {
    if (!rationale || rationale.trim() === '') {
      throw new Error('DECISION_RATIONALE_REQUIRED');
    }

    const allowedDecisions = [
      'APPROVE_FOR_FUTURE_EXECUTION',
      'REJECT_INTERVENTION',
      'REQUEST_CHANGES',
      'RETURN_TO_PREPARATION',
      'ESCALATE_FOR_MANUAL_REVIEW',
      'REQUIRE_ADDITIONAL_EVIDENCE'
    ];

    if (!allowedDecisions.includes(decision)) {
      throw new Error('INVALID_APPROVAL_DECISION');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let approval = null;
    if (!isProdLike) {
      approval = builderService._mockState.approvals.get(approvalId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_approvals WHERE approval_id = ?", [approvalId]);
      if (list.length > 0) approval = list[0];
    }

    if (!approval) throw new Error('APPROVAL_NOT_FOUND');
    if (approval.approval_status === 'FINALIZED') throw new Error('CANNOT_MODIFY_FINALIZED_APPROVAL');

    // Update status based on decision
    let nextStatus = 'UNDER_APPROVAL';
    if (decision === 'REJECT_INTERVENTION') nextStatus = 'REJECTED';
    else if (decision === 'REQUEST_CHANGES') nextStatus = 'CHANGES_REQUESTED';
    else if (decision === 'RETURN_TO_PREPARATION') nextStatus = 'RETURNED_TO_PREPARATION';
    else if (decision === 'ESCALATE_FOR_MANUAL_REVIEW') nextStatus = 'ESCALATED';

    if (!isProdLike) {
      approval.approval_decision = decision;
      approval.approval_status = nextStatus;
      if (decision === 'REJECT_INTERVENTION') {
        approval.rejected_by = actorId;
        approval.rejected_at = new Date();
        approval.rejected_reason = rationale;
      } else if (decision === 'APPROVE_FOR_FUTURE_EXECUTION') {
        approval.approved_by = actorId;
        approval.approved_at = new Date();
      }
      builderService._mockState.approvals.set(approvalId, approval);
    } else {
      if (decision === 'REJECT_INTERVENTION') {
        await db.query(
          "UPDATE controlled_beta_cohort_intervention_approvals SET approval_decision = ?, approval_status = ?, rejected_by = ?, rejected_at = NOW(), rejected_reason = ? WHERE approval_id = ?",
          [decision, nextStatus, actorId, rationale, approvalId]
        );
      } else if (decision === 'APPROVE_FOR_FUTURE_EXECUTION') {
        await db.query(
          "UPDATE controlled_beta_cohort_intervention_approvals SET approval_decision = ?, approval_status = ?, approved_by = ?, approved_at = NOW() WHERE approval_id = ?",
          [decision, nextStatus, actorId, approvalId]
        );
      } else {
        await db.query(
          "UPDATE controlled_beta_cohort_intervention_approvals SET approval_decision = ?, approval_status = ? WHERE approval_id = ?",
          [decision, nextStatus, approvalId]
        );
      }
    }

    await auditService.recordAuditEvent(approvalId, 'DECISION_RECORDED', actorId, { decision, rationale });
    return { ok: true };
  }
}

const serviceInstance = new CohortInterventionApprovalDecisionService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionApprovalDecisionService = CohortInterventionApprovalDecisionService;
