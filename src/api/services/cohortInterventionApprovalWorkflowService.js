'use strict';

const db = require('./mysqlClient');
const builderService = require('./cohortInterventionApprovalBuilderService').serviceInstance || require('./cohortInterventionApprovalBuilderService');
const auditService = require('./cohortInterventionApprovalAuditService').serviceInstance || require('./cohortInterventionApprovalAuditService');
const guardrailService = require('./cohortInterventionApprovalGuardrailService').serviceInstance || require('./cohortInterventionApprovalGuardrailService');
const evidencePackService = require('./cohortInterventionApprovalEvidencePackService').serviceInstance || require('./cohortInterventionApprovalEvidencePackService');
const preparationReviewService = require('./cohortInterventionPreparationReviewService').serviceInstance || require('./cohortInterventionPreparationReviewService');

class CohortInterventionApprovalWorkflowService {
  async getApproval(approvalId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return builderService._mockState.approvals.get(approvalId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_approvals WHERE approval_id = ?", [approvalId]);
      return list.length > 0 ? list[0] : null;
    }
  }

  async getSteps(approvalId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return builderService._mockState.steps.get(approvalId) || [];
    } else {
      return await db.query("SELECT * FROM controlled_beta_cohort_intervention_approval_steps WHERE approval_id = ?", [approvalId]);
    }
  }

  async signStep(approvalId, role, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const approval = await this.getApproval(approvalId);
    if (!approval) throw new Error('APPROVAL_NOT_FOUND');
    if (approval.approval_status === 'FINALIZED') throw new Error('CANNOT_MODIFY_FINALIZED_APPROVAL');

    // Update steps
    let steps = await this.getSteps(approvalId);
    const step = steps.find(s => s.role === role);
    if (!step) throw new Error('STEP_ROLE_NOT_REQUIRED');
    step.status = 'SIGNED';
    step.approver_id = actorId;
    step.signed_at = new Date().toISOString();

    // Update approvals required_approvers_json
    let approvers = [];
    if (typeof approval.required_approvers_json === 'string') {
      approvers = JSON.parse(approval.required_approvers_json);
    } else {
      approvers = approval.required_approvers_json || [];
    }
    const app = approvers.find(a => a.role === role);
    if (app) {
      app.signed = true;
      app.signed_by = actorId;
      app.signed_at = step.signed_at;
    }

    if (!isProdLike) {
      builderService._mockState.steps.set(approvalId, steps);
      approval.required_approvers_json = approvers;
      builderService._mockState.approvals.set(approvalId, approval);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_approval_steps SET status = 'SIGNED', approver_id = ?, signed_at = NOW() WHERE approval_id = ? AND role = ?",
        [actorId, approvalId, role]
      );
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_approvals SET required_approvers_json = ? WHERE approval_id = ?",
        [JSON.stringify(approvers), approvalId]
      );
    }

    await auditService.recordAuditEvent(approvalId, 'STEP_SIGNED_OFF', actorId, { role });
    return { ok: true };
  }

  async finalizeApproval(approvalId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let approval = await this.getApproval(approvalId);
    if (!approval) throw new Error('APPROVAL_NOT_FOUND');
    if (approval.approval_status === 'FINALIZED') throw new Error('APPROVAL_ALREADY_FINALIZED');

    // Verification steps
    const sourcePrep = await preparationReviewService.getPreparation(approval.source_preparation_id);
    const sourcePreparationNotFinalized = !sourcePrep || sourcePrep.preparation_status !== 'FINALIZED';

    let attestation = {};
    if (typeof approval.non_execution_attestation_json === 'string') {
      attestation = JSON.parse(approval.non_execution_attestation_json);
    } else {
      attestation = approval.non_execution_attestation_json || {};
    }
    // Just a placeholder check (if it was somehow violated)
    const nonExecutionAttestationInvalid = attestation.approval_executed_intervention === true;

    // Check all steps signed off
    const steps = await this.getSteps(approvalId);
    const missingRequiredSignatures = steps.some(s => s.status !== 'SIGNED');

    const guardrailRes = await guardrailService.runGuardrailChecks(approval);
    const guardrailFailed = !guardrailRes.passed;

    const blockers = {
      missing_evidence_pack: false,
      missing_required_signatures: missingRequiredSignatures,
      non_execution_attestation_invalid: nonExecutionAttestationInvalid,
      guardrail_failed: guardrailFailed,
      source_preparation_not_finalized: sourcePreparationNotFinalized
    };

    const hasBlockers = Object.values(blockers).some(val => val === true);

    if (!isProdLike) {
      approval.approval_blockers_json = blockers;
      builderService._mockState.approvals.set(approvalId, approval);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_approvals SET approval_blockers_json = ? WHERE approval_id = ?",
        [JSON.stringify(blockers), approvalId]
      );
    }

    if (hasBlockers) {
      throw new Error('APPROVAL_FINALIZATION_BLOCKED');
    }

    // Build evidence pack version 139.0
    const evidence = await evidencePackService.buildEvidencePack(
      approvalId,
      sourcePrep,
      steps,
      attestation,
      approval.approval_decision || 'APPROVE_FOR_FUTURE_EXECUTION',
      approval.rejected_reason || 'Finalized decision bundle'
    );

    // Save finalized state
    if (!isProdLike) {
      approval.approval_status = 'FINALIZED';
      approval.reviewed_by = actorId;
      approval.finalized_at = new Date();
      builderService._mockState.approvals.set(approvalId, approval);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_approvals SET approval_status = 'FINALIZED', reviewed_by = ?, finalized_at = NOW() WHERE approval_id = ?",
        [actorId, approvalId]
      );
    }

    await auditService.recordAuditEvent(approvalId, 'APPROVAL_FINALIZED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });

    return {
      approval: await this.getApproval(approvalId),
      evidence
    };
  }

  async rejectApproval(approvalId, reason, actorId) {
    if (!reason || reason.trim() === '') throw new Error('REJECTION_REASON_EXIGENTLY_REQUIRED');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const approval = await this.getApproval(approvalId);
    if (!approval) throw new Error('APPROVAL_NOT_FOUND');

    if (!isProdLike) {
      approval.approval_status = 'REJECTED';
      approval.rejected_at = new Date();
      approval.rejected_reason = reason;
      builderService._mockState.approvals.set(approvalId, approval);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_approvals SET approval_status = 'REJECTED', rejected_at = NOW(), rejected_reason = ? WHERE approval_id = ?",
        [reason, approvalId]
      );
    }

    await auditService.recordAuditEvent(approvalId, 'APPROVAL_REJECTED', actorId, { reason });
    return { ok: true };
  }

  async requestChanges(approvalId, reason, actorId) {
    if (!reason || reason.trim() === '') throw new Error('CHANGES_REQUEST_REASON_EXIGENTLY_REQUIRED');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const approval = await this.getApproval(approvalId);
    if (!approval) throw new Error('APPROVAL_NOT_FOUND');

    if (!isProdLike) {
      approval.approval_status = 'CHANGES_REQUESTED';
      approval.rejected_reason = reason;
      builderService._mockState.approvals.set(approvalId, approval);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_approvals SET approval_status = 'CHANGES_REQUESTED', rejected_reason = ? WHERE approval_id = ?",
        [reason, approvalId]
      );
    }

    await auditService.recordAuditEvent(approvalId, 'APPROVAL_CHANGES_REQUESTED', actorId, { reason });
    return { ok: true };
  }

  async returnToPreparation(approvalId, reason, actorId) {
    if (!reason || reason.trim() === '') throw new Error('RETURN_REASON_EXIGENTLY_REQUIRED');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const approval = await this.getApproval(approvalId);
    if (!approval) throw new Error('APPROVAL_NOT_FOUND');

    if (!isProdLike) {
      approval.approval_status = 'RETURNED_TO_PREPARATION';
      approval.rejected_reason = reason;
      builderService._mockState.approvals.set(approvalId, approval);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_approvals SET approval_status = 'RETURNED_TO_PREPARATION', rejected_reason = ? WHERE approval_id = ?",
        [reason, approvalId]
      );
    }

    await auditService.recordAuditEvent(approvalId, 'APPROVAL_RETURNED_TO_PREPARATION', actorId, { reason });
    return { ok: true };
  }

  async escalateApproval(approvalId, reason, actorId) {
    if (!reason || reason.trim() === '') throw new Error('ESCALATION_REASON_EXIGENTLY_REQUIRED');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const approval = await this.getApproval(approvalId);
    if (!approval) throw new Error('APPROVAL_NOT_FOUND');

    if (!isProdLike) {
      approval.approval_status = 'ESCALATED';
      approval.rejected_reason = reason;
      builderService._mockState.approvals.set(approvalId, approval);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_approvals SET approval_status = 'ESCALATED', rejected_reason = ? WHERE approval_id = ?",
        [reason, approvalId]
      );
    }

    await auditService.recordAuditEvent(approvalId, 'APPROVAL_ESCALATED', actorId, { reason });
    return { ok: true };
  }

  async supersedeApproval(approvalId, supersededByApprovalId, reason, actorId) {
    if (!reason || reason.trim() === '') throw new Error('SUPERSEDE_REASON_EXIGENTLY_REQUIRED');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const approval = await this.getApproval(approvalId);
    if (!approval) throw new Error('APPROVAL_NOT_FOUND');

    if (!isProdLike) {
      approval.approval_status = 'SUPERSEDED';
      approval.superseded_at = new Date();
      approval.superseded_by_approval_id = supersededByApprovalId;
      approval.superseded_reason = reason;
      builderService._mockState.approvals.set(approvalId, approval);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_approvals SET approval_status = 'SUPERSEDED', superseded_at = NOW(), superseded_by_approval_id = ?, superseded_reason = ? WHERE approval_id = ?",
        [supersededByApprovalId, reason, approvalId]
      );
    }

    await auditService.recordAuditEvent(approvalId, 'APPROVAL_SUPERSEDED', actorId, { superseded_by_approval_id: supersededByApprovalId, reason });
    return { ok: true };
  }
}

const serviceInstance = new CohortInterventionApprovalWorkflowService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionApprovalWorkflowService = CohortInterventionApprovalWorkflowService;
