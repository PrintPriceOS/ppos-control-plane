'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const prepBuilderSvc = require('./cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('./cohortInterventionSimulationApprovalPreparationBuilderService');
const reviewBuilderSvc = require('./cohortInterventionSimulationReviewBuilderService').serviceInstance || require('./cohortInterventionSimulationReviewBuilderService');
const auditService = require('./cohortInterventionSimulationApprovalPreparationAuditService').serviceInstance || require('./cohortInterventionSimulationApprovalPreparationAuditService');

class CohortInterventionSimulationApprovalPreparationEvaluatorService {
  constructor() {
    this._mockState = {};
  }

  async evaluatePrep(prepId, actorId = 'system', overrides = null) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const prep = await prepBuilderSvc.getPrep(prepId);
    if (!prep) {
      throw new Error('PREP_NOT_FOUND');
    }

    if (prep.prep_status !== 'DRAFT' && prep.prep_status !== 'READY_FOR_EVALUATION' && prep.prep_status !== 'EVALUATED') {
      throw new Error(`PREP_NOT_EVALUATABLE: Status is ${prep.prep_status}`);
    }

    const review = await reviewBuilderSvc.getReview(prep.source_review_id);
    if (!review) {
      throw new Error('PHASE142_REVIEW_NOT_FOUND');
    }

    let projectedImpactScore = Number(review.projected_impact_score) || 30.0;
    let rollbackFeasibilityScore = Number(review.rollback_feasibility_score) || 75.0;
    let evidenceCompletenessScore = Number(review.evidence_completeness_score) || 95.0;
    let riskLevel = review.risk_level || 'LOW';
    let confidenceLevel = review.confidence_level || 'HIGH';
    let guardrailStatus = review.guardrail_status || 'PASS';
    let writeScopeStatus = review.write_scope_status || 'PASS';
    const findings = [];

    // Map Phase 142 decision to Phase 143 prep outcome
    let prepOutcome = 'PREPARE_HIGH_RISK_REJECTION_PACKAGE';
    
    if (review.review_decision === 'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL') {
      if (prep.simulation_type === 'SIMULATE_COHORT_PAUSE') {
        prepOutcome = 'PREPARE_HIGH_RISK_COHORT_PAUSE_APPROVAL';
      } else if (prep.simulation_type === 'SIMULATE_PARTICIPANT_ACCESS_RESTRICTION') {
        prepOutcome = 'PREPARE_HIGH_RISK_PARTICIPANT_RESTRICTION_APPROVAL';
      } else if (prep.simulation_type === 'SIMULATE_INVITE_REVOCATION') {
        prepOutcome = 'PREPARE_HIGH_RISK_INVITE_REVOCATION_APPROVAL';
      } else if (prep.simulation_type === 'SIMULATE_CONTROLLED_EXPANSION') {
        prepOutcome = 'PREPARE_HIGH_RISK_CONTROLLED_EXPANSION_APPROVAL';
      } else {
        prepOutcome = 'PREPARE_HIGH_RISK_COHORT_PAUSE_APPROVAL';
      }
      findings.push({
        finding_type: 'OUTCOME_MAPPING',
        severity: 'INFO',
        description: `Review is ACCEPTED. Mapping to future high-risk approval package for ${prep.simulation_type}`
      });
    } else if (review.review_decision === 'REQUEST_RE_SIMULATION') {
      prepOutcome = 'PREPARE_HIGH_RISK_RE_SIMULATION_REQUEST';
      findings.push({
        finding_type: 'OUTCOME_MAPPING',
        severity: 'WARNING',
        description: 'Review requested re-simulation. Mapping to re-simulation request package.'
      });
    } else if (review.review_decision === 'ESCALATE_TO_GOVERNANCE_OWNER') {
      prepOutcome = 'PREPARE_HIGH_RISK_GOVERNANCE_ESCALATION';
      findings.push({
        finding_type: 'OUTCOME_MAPPING',
        severity: 'WARNING',
        description: 'Review escalated to governance owner. Preparing escalation package.'
      });
    } else {
      prepOutcome = 'PREPARE_HIGH_RISK_REJECTION_PACKAGE';
      findings.push({
        finding_type: 'OUTCOME_MAPPING',
        severity: 'CRITICAL',
        description: `Review decision is ${review.review_decision || 'REJECTED'}. Mapping to rejection package.`
      });
    }

    if (overrides) {
      if (overrides.prep_outcome !== undefined) prepOutcome = overrides.prep_outcome;
      if (overrides.projected_impact_score !== undefined) projectedImpactScore = overrides.projected_impact_score;
      if (overrides.rollback_feasibility_score !== undefined) rollbackFeasibilityScore = overrides.rollback_feasibility_score;
      if (overrides.risk_level !== undefined) riskLevel = overrides.risk_level;
      if (overrides.confidence_level !== undefined) confidenceLevel = overrides.confidence_level;
    }

    // Safety checks
    if (guardrailStatus !== 'PASS') {
      findings.push({
        finding_type: 'GUARDRAIL_VIOLATION',
        severity: 'CRITICAL',
        description: 'Source review guardrails failed. Preparation cannot proceed.'
      });
    }

    const summary = {
      evaluated_at: new Date().toISOString(),
      evaluator_version: '143.0',
      outcome_suggestion: prepOutcome,
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
      const record = prepBuilderSvc._mockState.preps.get(prepId);
      record.prep_status = 'EVALUATED';
      record.prep_outcome = prepOutcome;
      record.projected_impact_score = projectedImpactScore;
      record.rollback_feasibility_score = rollbackFeasibilityScore;
      record.evidence_completeness_score = evidenceCompletenessScore;
      record.risk_level = riskLevel;
      record.confidence_level = confidenceLevel;
      record.guardrail_status = guardrailStatus;
      record.write_scope_status = writeScopeStatus;
      record.prep_summary_json = summary;
      record.impact_review_json = impactReview;
      record.rollback_review_json = rollbackReview;
      record.guardrail_review_json = guardrailReview;
      record.prep_blockers_json = blockers;
      prepBuilderSvc._mockState.preps.set(prepId, record);

      const fList = findings.map(f => ({
        finding_id: 'prf_' + crypto.randomBytes(8).toString('hex'),
        prep_id: prepId,
        finding_type: f.finding_type,
        severity: f.severity,
        description: f.description,
        created_at: new Date()
      }));
      prepBuilderSvc._mockState.findings.set(prepId, fList);
    } else {
      await db.query(
        `UPDATE controlled_beta_cohort_intervention_app_preps
         SET prep_status = ?,
             prep_outcome = ?,
             projected_impact_score = ?,
             rollback_feasibility_score = ?,
             evidence_completeness_score = ?,
             risk_level = ?,
             confidence_level = ?,
             guardrail_status = ?,
             write_scope_status = ?,
             prep_summary_json = ?,
             impact_review_json = ?,
             rollback_review_json = ?,
             guardrail_review_json = ?,
             prep_blockers_json = ?
         WHERE prep_id = ?`,
        [
          'EVALUATED', prepOutcome, projectedImpactScore, rollbackFeasibilityScore, evidenceCompletenessScore,
          riskLevel, confidenceLevel, guardrailStatus, writeScopeStatus,
          JSON.stringify(summary), JSON.stringify(impactReview),
          JSON.stringify(rollbackReview), JSON.stringify(guardrailReview),
          JSON.stringify(blockers), prepId
        ]
      );

      // Clean and write findings
      await db.query('DELETE FROM controlled_beta_cohort_intervention_app_prep_findings WHERE prep_id = ?', [prepId]);
      for (const finding of findings) {
        const findingId = 'prf_' + crypto.randomBytes(8).toString('hex');
        await db.query(
          `INSERT INTO controlled_beta_cohort_intervention_app_prep_findings
           (finding_id, prep_id, finding_type, severity, description)
           VALUES (?, ?, ?, ?, ?)`,
          [findingId, prepId, finding.finding_type, finding.severity, finding.description]
        );
      }
    }

    await auditService.recordAuditEvent(prepId, 'PREPARATION_EVALUATED', actorId, {
      prep_outcome: prepOutcome,
      findings_count: findings.length
    });

    return { success: true };
  }

  async getFindings(prepId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return prepBuilderSvc._mockState.findings.get(prepId) || [];
    } else {
      return await db.query('SELECT * FROM controlled_beta_cohort_intervention_app_prep_findings WHERE prep_id = ?', [prepId]);
    }
  }
}

const serviceInstance = new CohortInterventionSimulationApprovalPreparationEvaluatorService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationApprovalPreparationEvaluatorService = CohortInterventionSimulationApprovalPreparationEvaluatorService;
