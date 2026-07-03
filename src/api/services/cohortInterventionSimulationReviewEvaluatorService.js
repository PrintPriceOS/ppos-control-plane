'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const reviewBuilderSvc = require('./cohortInterventionSimulationReviewBuilderService').serviceInstance || require('./cohortInterventionSimulationReviewBuilderService');
const auditService = require('./cohortInterventionSimulationReviewAuditService').serviceInstance || require('./cohortInterventionSimulationReviewAuditService');

class CohortInterventionSimulationReviewEvaluatorService {
  constructor() {
    this._mockState = {};
  }

  async evaluateReview(reviewId, actorId = 'system', overrides = null) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const review = await reviewBuilderSvc.getReview(reviewId);
    if (!review) {
      throw new Error('REVIEW_NOT_FOUND');
    }
    if (review.review_status !== 'DRAFT' && review.review_status !== 'READY_FOR_REVIEW' && review.review_status !== 'UNDER_REVIEW') {
      throw new Error(`REVIEW_NOT_EVALUATABLE: Status is ${review.review_status}`);
    }

    // Default base scores based on simulation type
    let projectedImpactScore = 25.0;
    let rollbackFeasibilityScore = 75.0;
    let evidenceCompletenessScore = 95.0;
    let riskLevel = 'LOW';
    let confidenceLevel = 'HIGH';
    let guardrailStatus = 'PASS';
    let writeScopeStatus = 'PASS';
    const findings = [];

    // Let's set some typical values based on type
    if (review.simulation_type === 'SIMULATE_COHORT_PAUSE') {
      projectedImpactScore = 30.0;
      rollbackFeasibilityScore = 75.0;
      riskLevel = 'HIGH';
    } else if (review.simulation_type === 'SIMULATE_PARTICIPANT_ACCESS_RESTRICTION') {
      projectedImpactScore = 20.0;
      rollbackFeasibilityScore = 85.0;
      riskLevel = 'MEDIUM';
    } else if (review.simulation_type === 'SIMULATE_INVITE_REVOCATION') {
      projectedImpactScore = 15.0;
      rollbackFeasibilityScore = 45.0; // invite re-issuance is complex
      riskLevel = 'HIGH';
    } else if (review.simulation_type === 'SIMULATE_CONTROLLED_EXPANSION') {
      projectedImpactScore = 40.0;
      rollbackFeasibilityScore = 80.0;
      riskLevel = 'MEDIUM';
    }

    // Apply overrides if provided (for smoke testing different branches)
    if (overrides) {
      if (overrides.projected_impact_score !== undefined) projectedImpactScore = overrides.projected_impact_score;
      if (overrides.rollback_feasibility_score !== undefined) rollbackFeasibilityScore = overrides.rollback_feasibility_score;
      if (overrides.evidence_completeness_score !== undefined) evidenceCompletenessScore = overrides.evidence_completeness_score;
      if (overrides.risk_level !== undefined) riskLevel = overrides.risk_level;
      if (overrides.confidence_level !== undefined) confidenceLevel = overrides.confidence_level;
      if (overrides.guardrail_status !== undefined) guardrailStatus = overrides.guardrail_status;
      if (overrides.write_scope_status !== undefined) writeScopeStatus = overrides.write_scope_status;
      if (overrides.findings !== undefined && Array.isArray(overrides.findings)) {
        findings.push(...overrides.findings);
      }
    }

    // Determine Suggested Review Decision based on rules
    let suggestedDecision = 'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL';

    // 1. BLOCK_HIGH_RISK_EXECUTION_PATH (Highest priority)
    if (guardrailStatus === 'FAIL' || writeScopeStatus === 'FAIL' || (overrides && overrides.block_path === true)) {
      suggestedDecision = 'BLOCK_HIGH_RISK_EXECUTION_PATH';
      findings.push({
        finding_type: 'GUARDRAIL_VIOLATION',
        severity: 'CRITICAL',
        description: 'Guardrails or write-scope attestation failed. High-risk execution path blocked.'
      });
    }
    // 2. ESCALATE_TO_GOVERNANCE_OWNER
    else if (review.simulation_type === 'SIMULATE_CONTROLLED_EXPANSION' && (riskLevel === 'HIGH' || riskLevel === 'CRITICAL' || (overrides && overrides.escalate === true))) {
      suggestedDecision = 'ESCALATE_TO_GOVERNANCE_OWNER';
      findings.push({
        finding_type: 'ESCALATION_REQUIRED',
        severity: 'WARNING',
        description: 'Controlled expansion with HIGH/CRITICAL risk requires governance owner escalation.'
      });
    }
    // 3. REJECT_SIMULATION_OUTCOME
    else if (projectedImpactScore > 80.0 || rollbackFeasibilityScore < 40.0 || (overrides && overrides.reject === true)) {
      suggestedDecision = 'REJECT_SIMULATION_OUTCOME';
      findings.push({
        finding_type: 'UNACCEPTABLE_METRICS',
        severity: 'ERROR',
        description: `Projected impact (${projectedImpactScore}) too high or rollback feasibility (${rollbackFeasibilityScore}) too low.`
      });
    }
    // 4. REQUEST_RE_SIMULATION
    else if (evidenceCompletenessScore < 50.0 || (overrides && overrides.request_resimulation === true)) {
      suggestedDecision = 'REQUEST_RE_SIMULATION';
      findings.push({
        finding_type: 'STALE_OR_INCOMPLETE',
        severity: 'WARNING',
        description: 'Simulation evidence is incomplete or stale. Re-simulation requested.'
      });
    }
    // 5. REQUIRE_ADDITIONAL_IMPACT_ANALYSIS
    else if (projectedImpactScore > 50.0 && projectedImpactScore <= 80.0) {
      suggestedDecision = 'REQUIRE_ADDITIONAL_IMPACT_ANALYSIS';
      findings.push({
        finding_type: 'BROAD_IMPACT',
        severity: 'WARNING',
        description: 'Projected impact score is elevated. Additional impact analysis required.'
      });
    }
    // 6. REQUIRE_ROLLBACK_REVIEW
    else if (rollbackFeasibilityScore >= 40.0 && rollbackFeasibilityScore < 70.0) {
      suggestedDecision = 'REQUIRE_ROLLBACK_REVIEW';
      findings.push({
        finding_type: 'COMPLEX_ROLLBACK',
        severity: 'WARNING',
        description: 'Rollback feasibility is moderate/low. Dedicated rollback review required.'
      });
    }

    if (findings.length === 0) {
      findings.push({
        finding_type: 'EVALUATION_PASS',
        severity: 'INFO',
        description: 'Simulation meets all baseline criteria.'
      });
    }

    // Update review record
    const summary = {
      projected_impact_score: projectedImpactScore,
      rollback_feasibility_score: rollbackFeasibilityScore,
      evidence_completeness_score: evidenceCompletenessScore,
      risk_level: riskLevel,
      confidence_level: confidenceLevel,
      guardrail_status: guardrailStatus,
      write_scope_status: writeScopeStatus,
      suggested_decision: suggestedDecision
    };

    const impactReview = {
      evaluated_impact_score: projectedImpactScore,
      within_tolerance: projectedImpactScore <= 35.0,
      timestamp: new Date().toISOString()
    };

    const rollbackReview = {
      evaluated_feasibility_score: rollbackFeasibilityScore,
      feasible: rollbackFeasibilityScore >= 70.0,
      timestamp: new Date().toISOString()
    };

    const guardrailReview = {
      status: guardrailStatus,
      timestamp: new Date().toISOString()
    };

    const blockers = {
      missing_evaluation: false,
      missing_decision: true
    };

    if (!isProdLike) {
      const record = reviewBuilderSvc._mockState.reviews.get(reviewId);
      record.review_status = 'UNDER_REVIEW';
      record.projected_impact_score = projectedImpactScore;
      record.rollback_feasibility_score = rollbackFeasibilityScore;
      record.evidence_completeness_score = evidenceCompletenessScore;
      record.risk_level = riskLevel;
      record.confidence_level = confidenceLevel;
      record.guardrail_status = guardrailStatus;
      record.write_scope_status = writeScopeStatus;
      record.review_summary_json = summary;
      record.impact_review_json = impactReview;
      record.rollback_review_json = rollbackReview;
      record.guardrail_review_json = guardrailReview;
      record.review_blockers_json = blockers;
      reviewBuilderSvc._mockState.reviews.set(reviewId, record);

      reviewBuilderSvc._mockState.findings.set(reviewId, findings);
    } else {
      await db.query(
        `UPDATE controlled_beta_cohort_intervention_sim_reviews
         SET review_status = 'UNDER_REVIEW',
             projected_impact_score = ?,
             rollback_feasibility_score = ?,
             evidence_completeness_score = ?,
             risk_level = ?,
             confidence_level = ?,
             guardrail_status = ?,
             write_scope_status = ?,
             review_summary_json = ?,
             impact_review_json = ?,
             rollback_review_json = ?,
             guardrail_review_json = ?,
             review_blockers_json = ?
         WHERE review_id = ?`,
        [
          projectedImpactScore, rollbackFeasibilityScore, evidenceCompletenessScore,
          riskLevel, confidenceLevel, guardrailStatus, writeScopeStatus,
          JSON.stringify(summary), JSON.stringify(impactReview),
          JSON.stringify(rollbackReview), JSON.stringify(guardrailReview),
          JSON.stringify(blockers), reviewId
        ]
      );

      // Clean existing findings and write new ones
      await db.query('DELETE FROM controlled_beta_cohort_intervention_sim_review_findings WHERE review_id = ?', [reviewId]);
      for (const finding of findings) {
        const findingId = 'srf_' + crypto.randomBytes(8).toString('hex');
        await db.query(
          `INSERT INTO controlled_beta_cohort_intervention_sim_review_findings
           (finding_id, review_id, finding_type, severity, description)
           VALUES (?, ?, ?, ?, ?)`,
          [findingId, reviewId, finding.finding_type, finding.severity, finding.description]
        );
      }
    }

    await auditService.recordAuditEvent(reviewId, 'REVIEW_EVALUATED', actorId, {
      suggested_decision: suggestedDecision,
      risk_level: riskLevel,
      findings_count: findings.length
    });

    const updated = await reviewBuilderSvc.getReview(reviewId);
    return { review: updated, findings };
  }

  async getFindings(reviewId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return reviewBuilderSvc._mockState.findings.get(reviewId) || [];
    } else {
      return await db.query('SELECT * FROM controlled_beta_cohort_intervention_sim_review_findings WHERE review_id = ?', [reviewId]);
    }
  }
}

const serviceInstance = new CohortInterventionSimulationReviewEvaluatorService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationReviewEvaluatorService = CohortInterventionSimulationReviewEvaluatorService;
