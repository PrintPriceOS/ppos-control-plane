'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const reviewBuilderSvc = require('./cohortInterventionSimulationReviewBuilderService').serviceInstance || require('./cohortInterventionSimulationReviewBuilderService');
const auditService = require('./cohortInterventionSimulationReviewAuditService').serviceInstance || require('./cohortInterventionSimulationReviewAuditService');

const VALID_DECISIONS = [
  'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL',
  'REJECT_SIMULATION_OUTCOME',
  'REQUEST_RE_SIMULATION',
  'REQUIRE_ADDITIONAL_IMPACT_ANALYSIS',
  'REQUIRE_ROLLBACK_REVIEW',
  'ESCALATE_TO_GOVERNANCE_OWNER',
  'BLOCK_HIGH_RISK_EXECUTION_PATH'
];

class CohortInterventionSimulationReviewDecisionService {
  constructor() {
    this._mockState = {
      decisions: new Map()
    };
  }

  async recordDecision(reviewId, decision, rationale, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Load review
    const review = await reviewBuilderSvc.getReview(reviewId);
    if (!review) {
      throw new Error('REVIEW_NOT_FOUND');
    }

    // 2. Validate review is not finalized or superseded
    if (review.review_status === 'FINALIZED' || review.review_status === 'SUPERSEDED') {
      throw new Error(`REVIEW_LOCKED: Cannot record decision for status ${review.review_status}`);
    }

    // 3. Validate decision
    if (!VALID_DECISIONS.includes(decision)) {
      throw new Error(`INVALID_REVIEW_DECISION: ${decision}`);
    }

    // 4. Require rationale & actorId
    if (!rationale || rationale.trim().length === 0) {
      throw new Error('RATIONALE_REQUIRED');
    }
    if (!actorId || actorId.trim().length === 0) {
      throw new Error('ACTOR_REQUIRED');
    }

    const decisionId = 'srd_' + crypto.randomBytes(8).toString('hex');
    const decisionRecord = {
      decision_id: decisionId,
      review_id: reviewId,
      decision: decision,
      rationale: rationale,
      actor_id: actorId,
      created_at: new Date()
    };

    // Determine status from decision
    let newStatus = 'UNDER_REVIEW';
    if (decision === 'ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL') {
      newStatus = 'ACCEPTED';
    } else if (decision === 'REJECT_SIMULATION_OUTCOME') {
      newStatus = 'REJECTED';
    } else if (decision === 'REQUEST_RE_SIMULATION') {
      newStatus = 'CHANGES_REQUESTED';
    } else if (decision === 'REQUIRE_ADDITIONAL_IMPACT_ANALYSIS') {
      newStatus = 'CHANGES_REQUESTED';
    } else if (decision === 'REQUIRE_ROLLBACK_REVIEW') {
      newStatus = 'CHANGES_REQUESTED';
    } else if (decision === 'ESCALATE_TO_GOVERNANCE_OWNER') {
      newStatus = 'ESCALATED';
    } else if (decision === 'BLOCK_HIGH_RISK_EXECUTION_PATH') {
      newStatus = 'BLOCKED';
    }

    const blockers = {
      missing_evaluation: false,
      missing_decision: false
    };

    if (!isProdLike) {
      this._mockState.decisions.set(reviewId, decisionRecord);
      
      const record = reviewBuilderSvc._mockState.reviews.get(reviewId);
      record.review_decision = decision;
      record.review_status = newStatus;
      record.reviewed_by = actorId;
      record.reviewed_at = new Date();
      record.review_blockers_json = blockers;
      reviewBuilderSvc._mockState.reviews.set(reviewId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_simulation_review_decisions
         (decision_id, review_id, decision, rationale, actor_id)
         VALUES (?, ?, ?, ?, ?)`,
        [decisionId, reviewId, decision, rationale, actorId]
      );

      await db.query(
        `UPDATE controlled_beta_cohort_intervention_simulation_reviews
         SET review_decision = ?,
             review_status = ?,
             reviewed_by = ?,
             reviewed_at = NOW(),
             review_blockers_json = ?
         WHERE review_id = ?`,
        [decision, newStatus, actorId, JSON.stringify(blockers), reviewId]
      );
    }

    await auditService.recordAuditEvent(reviewId, 'REVIEW_DECISION_RECORDED', actorId, {
      decision: decision,
      status: newStatus,
      rationale: rationale
    });

    const updated = await reviewBuilderSvc.getReview(reviewId);
    return { review: updated, decision: decisionRecord };
  }

  async finalizeReview(reviewId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const review = await reviewBuilderSvc.getReview(reviewId);
    if (!review) {
      throw new Error('REVIEW_NOT_FOUND');
    }
    if (review.review_status === 'FINALIZED' || review.review_status === 'SUPERSEDED') {
      throw new Error(`REVIEW_ALREADY_FINALIZED: Status is ${review.review_status}`);
    }

    if (!review.review_decision) {
      throw new Error('DECISION_REQUIRED_BEFORE_FINALIZATION');
    }

    if (!isProdLike) {
      const record = reviewBuilderSvc._mockState.reviews.get(reviewId);
      record.review_status = 'FINALIZED';
      record.finalized_by = actorId;
      record.finalized_at = new Date();
      reviewBuilderSvc._mockState.reviews.set(reviewId, record);
    } else {
      await db.query(
        `UPDATE controlled_beta_cohort_intervention_simulation_reviews
         SET review_status = 'FINALIZED',
             finalized_by = ?,
             finalized_at = NOW()
         WHERE review_id = ?`,
        [actorId, reviewId]
      );
    }

    await auditService.recordAuditEvent(reviewId, 'REVIEW_FINALIZED', actorId);

    const updated = await reviewBuilderSvc.getReview(reviewId);
    return { review: updated };
  }

  async requestResimulation(reviewId, reason, actorId = 'system') {
    if (!reason || reason.trim().length === 0) {
      throw new Error('REASON_REQUIRED');
    }
    const result = await this.recordDecision(reviewId, 'REQUEST_RE_SIMULATION', reason, actorId);
    await auditService.recordAuditEvent(reviewId, 'REVIEW_RESIMULATION_REQUESTED', actorId, { reason });
    return result;
  }

  async escalateReview(reviewId, reason, actorId = 'system') {
    if (!reason || reason.trim().length === 0) {
      throw new Error('REASON_REQUIRED');
    }
    const result = await this.recordDecision(reviewId, 'ESCALATE_TO_GOVERNANCE_OWNER', reason, actorId);
    await auditService.recordAuditEvent(reviewId, 'REVIEW_ESCALATED', actorId, { reason });
    return result;
  }

  async blockReview(reviewId, reason, actorId = 'system') {
    if (!reason || reason.trim().length === 0) {
      throw new Error('REASON_REQUIRED');
    }
    const result = await this.recordDecision(reviewId, 'BLOCK_HIGH_RISK_EXECUTION_PATH', reason, actorId);
    await auditService.recordAuditEvent(reviewId, 'REVIEW_BLOCKED', actorId, { reason });
    return result;
  }

  async rejectReview(reviewId, reason, actorId = 'system') {
    if (!reason || reason.trim().length === 0) {
      throw new Error('REASON_REQUIRED');
    }
    const result = await this.recordDecision(reviewId, 'REJECT_SIMULATION_OUTCOME', reason, actorId);
    await auditService.recordAuditEvent(reviewId, 'REVIEW_REJECTED', actorId, { reason });
    return result;
  }

  async supersedeReview(reviewId, reason, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!reason || reason.trim().length === 0) {
      throw new Error('REASON_REQUIRED');
    }

    const review = await reviewBuilderSvc.getReview(reviewId);
    if (!review) {
      throw new Error('REVIEW_NOT_FOUND');
    }

    if (!isProdLike) {
      const record = reviewBuilderSvc._mockState.reviews.get(reviewId);
      record.review_status = 'SUPERSEDED';
      record.superseded_at = new Date();
      reviewBuilderSvc._mockState.reviews.set(reviewId, record);
    } else {
      await db.query(
        `UPDATE controlled_beta_cohort_intervention_simulation_reviews
         SET review_status = 'SUPERSEDED',
             superseded_at = NOW()
         WHERE review_id = ?`,
        [reviewId]
      );
    }

    await auditService.recordAuditEvent(reviewId, 'REVIEW_SUPERSEDED', actorId, { reason });

    const updated = await reviewBuilderSvc.getReview(reviewId);
    return { review: updated };
  }

  async getDecision(reviewId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.decisions.get(reviewId);
    } else {
      const list = await db.query('SELECT * FROM controlled_beta_cohort_intervention_simulation_review_decisions WHERE review_id = ? ORDER BY created_at DESC LIMIT 1', [reviewId]);
      return list.length > 0 ? list[0] : null;
    }
  }
}

const serviceInstance = new CohortInterventionSimulationReviewDecisionService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationReviewDecisionService = CohortInterventionSimulationReviewDecisionService;
