'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const approvalBuilderSvc = require('./cohortInterventionSimulationApprovalBuilderService').serviceInstance || require('./cohortInterventionSimulationApprovalBuilderService');
const prepBuilderSvc = require('./cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('./cohortInterventionSimulationApprovalPreparationBuilderService');
const auditService = require('./cohortInterventionSimulationApprovalAuditService').serviceInstance || require('./cohortInterventionSimulationApprovalAuditService');

class CohortInterventionSimulationApprovalEvaluatorService {
  constructor() {
    this._mockState = {};
  }

  async evaluateApproval(approvalId, actorId = 'system', overrides = null) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const approval = await approvalBuilderSvc.getApproval(approvalId);
    if (!approval) {
      throw new Error('APPROVAL_NOT_FOUND');
    }

    if (approval.approval_status !== 'DRAFT' && approval.approval_status !== 'READY_FOR_EVALUATION' && approval.approval_status !== 'EVALUATED') {
      throw new Error(`APPROVAL_NOT_EVALUATABLE: Status is ${approval.approval_status}`);
    }

    const prep = await prepBuilderSvc.getPrep(approval.source_prep_id);
    if (!prep) {
      throw new Error('PHASE143_PREPARATION_NOT_FOUND');
    }

    let projectedImpactScore = Number(approval.projected_impact_score) || 30.0;
    let rollbackFeasibilityScore = Number(approval.rollback_feasibility_score) || 75.0;
    let evidenceCompletenessScore = Number(approval.evidence_completeness_score) || 95.0;
    let riskLevel = approval.risk_level || 'LOW';
    let confidenceLevel = approval.confidence_level || 'HIGH';
    let guardrailStatus = approval.guardrail_status || 'PASS';
    let writeScopeStatus = approval.write_scope_status || 'PASS';
    const findings = [];

    // Map Phase 143 prep outcome to Phase 144 decision & eligibility
    let approvalDecision = 'REJECT_HIGH_RISK_INTERVENTION';
    let futureEligibility = 'BLOCKED_BY_APPROVAL_DECISION';
    let approvalExecutionStatus = 'REJECTED_NOT_EXECUTED';

    const prepOutcome = prep.prep_outcome || '';
    if (prepOutcome.startsWith('PREPARE_HIGH_RISK_') && prepOutcome.endsWith('_APPROVAL')) {
      if (prepOutcome === 'PREPARE_HIGH_RISK_COHORT_PAUSE_APPROVAL') {
        approvalDecision = 'APPROVE_HIGH_RISK_COHORT_PAUSE';
      } else if (prepOutcome === 'PREPARE_HIGH_RISK_PARTICIPANT_RESTRICTION_APPROVAL') {
        approvalDecision = 'APPROVE_HIGH_RISK_PARTICIPANT_RESTRICTION';
      } else if (prepOutcome === 'PREPARE_HIGH_RISK_INVITE_REVOCATION_APPROVAL') {
        approvalDecision = 'APPROVE_HIGH_RISK_INVITE_REVOCATION';
      } else if (prepOutcome === 'PREPARE_HIGH_RISK_CONTROLLED_EXPANSION_APPROVAL') {
        approvalDecision = 'APPROVE_HIGH_RISK_CONTROLLED_EXPANSION';
      } else {
        approvalDecision = 'APPROVE_HIGH_RISK_COHORT_PAUSE';
      }
      futureEligibility = 'ELIGIBLE_FOR_FUTURE_CONTROLLED_EXECUTION_GATE';
      approvalExecutionStatus = 'APPROVED_NOT_EXECUTED';

      findings.push({
        finding_type: 'DECISION_MAPPING',
        severity: 'INFO',
        description: `Preparation package outcome is ${prepOutcome}. Mapping to approval decision ${approvalDecision}`
      });
    } else if (prepOutcome === 'PREPARE_HIGH_RISK_RE_SIMULATION_REQUEST') {
      approvalDecision = 'REQUEST_RE_SIMULATION';
      futureEligibility = 'REQUIRES_RE_SIMULATION';
      approvalExecutionStatus = 'NOT_APPROVED_NOT_EXECUTED';
      findings.push({
        finding_type: 'DECISION_MAPPING',
        severity: 'WARNING',
        description: 'Preparation package requested re-simulation. Mapping to Request Re-simulation.'
      });
    } else if (prepOutcome === 'PREPARE_HIGH_RISK_GOVERNANCE_ESCALATION') {
      approvalDecision = 'ESCALATE_TO_GOVERNANCE_OWNER';
      futureEligibility = 'NOT_ELIGIBLE';
      approvalExecutionStatus = 'NOT_APPROVED_NOT_EXECUTED';
      findings.push({
        finding_type: 'DECISION_MAPPING',
        severity: 'WARNING',
        description: 'Preparation package is escalated. Mapping to Governance Escalation.'
      });
    } else {
      approvalDecision = 'REJECT_HIGH_RISK_INTERVENTION';
      futureEligibility = 'BLOCKED_BY_APPROVAL_DECISION';
      approvalExecutionStatus = 'REJECTED_NOT_EXECUTED';
      findings.push({
        finding_type: 'DECISION_MAPPING',
        severity: 'CRITICAL',
        description: `Preparation package outcome is ${prepOutcome || 'REJECTED'}. Mapping to rejection.`
      });
    }

    if (overrides) {
      if (overrides.approval_decision !== undefined) approvalDecision = overrides.approval_decision;
      if (overrides.projected_impact_score !== undefined) projectedImpactScore = overrides.projected_impact_score;
      if (overrides.rollback_feasibility_score !== undefined) rollbackFeasibilityScore = overrides.rollback_feasibility_score;
      if (overrides.future_execution_eligibility_status !== undefined) futureEligibility = overrides.future_execution_eligibility_status;
    }

    if (approvalDecision.startsWith('APPROVE_HIGH_RISK_')) {
      approvalExecutionStatus = 'APPROVED_NOT_EXECUTED';
    } else if (approvalDecision === 'REJECT_HIGH_RISK_INTERVENTION') {
      approvalExecutionStatus = 'REJECTED_NOT_EXECUTED';
    } else {
      approvalExecutionStatus = 'NOT_APPROVED_NOT_EXECUTED';
    }

    const summary = {
      evaluated_at: new Date().toISOString(),
      evaluator_version: '144.0',
      outcome_decision: approvalDecision,
      future_eligibility: futureEligibility,
      findings_count: findings.length
    };

    const impactReview = {
      source_impact_score: projectedImpactScore,
      risk_level: riskLevel,
      confidence_level: confidenceLevel
    };

    const rollbackReview = {
      source_rollback_score: rollbackFeasibilityScore
    };

    const guardrailReview = {
      guardrail_status: guardrailStatus,
      write_scope_status: writeScopeStatus
    };

    const blockers = {};

    if (!isProdLike) {
      const record = approvalBuilderSvc._mockState.approvals.get(approvalId);
      record.approval_status = 'EVALUATED';
      record.approval_decision = approvalDecision;
      record.projected_impact_score = projectedImpactScore;
      record.rollback_feasibility_score = rollbackFeasibilityScore;
      record.evidence_completeness_score = evidenceCompletenessScore;
      record.risk_level = riskLevel;
      record.confidence_level = confidenceLevel;
      record.guardrail_status = guardrailStatus;
      record.write_scope_status = writeScopeStatus;
      record.approval_summary_json = summary;
      record.impact_review_json = impactReview;
      record.rollback_review_json = rollbackReview;
      record.guardrail_review_json = guardrailReview;
      record.approval_blockers_json = blockers;
      record.approval_execution_status = approvalExecutionStatus;
      record.future_execution_eligibility_status = futureEligibility;
      approvalBuilderSvc._mockState.approvals.set(approvalId, record);

      const fList = findings.map(f => ({
        finding_id: 'apf_' + crypto.randomBytes(8).toString('hex'),
        approval_id: approvalId,
        finding_type: f.finding_type,
        severity: f.severity,
        description: f.description,
        created_at: new Date()
      }));
      approvalBuilderSvc._mockState.findings.set(approvalId, fList);
    } else {
      await db.query(
        `UPDATE controlled_beta_cohort_intervention_approvals
         SET approval_status = ?,
             approval_decision = ?,
             projected_impact_score = ?,
             rollback_feasibility_score = ?,
             evidence_completeness_score = ?,
             risk_level = ?,
             confidence_level = ?,
             guardrail_status = ?,
             write_scope_status = ?,
             approval_summary_json = ?,
             impact_review_json = ?,
             rollback_review_json = ?,
             guardrail_review_json = ?,
             approval_blockers_json = ?,
             approval_execution_status = ?,
             future_execution_eligibility_status = ?
         WHERE approval_id = ?`,
        [
          'EVALUATED', approvalDecision, projectedImpactScore, rollbackFeasibilityScore, evidenceCompletenessScore,
          riskLevel, confidenceLevel, guardrailStatus, writeScopeStatus,
          JSON.stringify(summary), JSON.stringify(impactReview),
          JSON.stringify(rollbackReview), JSON.stringify(guardrailReview),
          JSON.stringify(blockers), approvalExecutionStatus, futureEligibility, approvalId
        ]
      );

      // Clean and write findings
      await db.query('DELETE FROM controlled_beta_cohort_intervention_approval_findings WHERE approval_id = ?', [approvalId]);
      for (const finding of findings) {
        const findingId = 'apf_' + crypto.randomBytes(8).toString('hex');
        await db.query(
          `INSERT INTO controlled_beta_cohort_intervention_approval_findings
           (finding_id, approval_id, finding_type, severity, description)
           VALUES (?, ?, ?, ?, ?)`,
          [findingId, approvalId, finding.finding_type, finding.severity, finding.description]
        );
      }
    }

    await auditService.recordAuditEvent(approvalId, 'APPROVAL_EVALUATED', actorId, {
      approval_decision: approvalDecision,
      approval_execution_status: approvalExecutionStatus,
      future_execution_eligibility_status: futureEligibility
    });

    return { success: true };
  }

  async getFindings(approvalId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return approvalBuilderSvc._mockState.findings.get(approvalId) || [];
    } else {
      return await db.query('SELECT * FROM controlled_beta_cohort_intervention_approval_findings WHERE approval_id = ?', [approvalId]);
    }
  }
}

const serviceInstance = new CohortInterventionSimulationApprovalEvaluatorService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationApprovalEvaluatorService = CohortInterventionSimulationApprovalEvaluatorService;
