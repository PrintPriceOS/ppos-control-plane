'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const aggregator = require('./runtimeActivityReviewAggregatorService').serviceInstance || require('./runtimeActivityReviewAggregatorService');
const evaluator = require('./runtimeActivityCohortHealthEvaluatorService').serviceInstance || require('./runtimeActivityCohortHealthEvaluatorService');
const evidenceService = require('./runtimeActivityReviewEvidencePackService').serviceInstance || require('./runtimeActivityReviewEvidencePackService');
const auditService = require('./runtimeActivityReviewAuditService').serviceInstance || require('./runtimeActivityReviewAuditService');

class RuntimeActivityReviewDecisionService {
  constructor() {
    this._mockState = {
      reviews: new Map(),
      decisions: new Map(),
      findings: new Map()
    };
  }

  async createReview(tenantId, cohortId, windowStart, windowEnd) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const reviewId = 'rev_' + crypto.randomBytes(8).toString('hex');

    const attestation = {
      cohort_access_mutated: false,
      participant_access_mutated: false,
      invite_access_mutated: false,
      billing_state_mutated: false,
      payment_execution_triggered: false,
      provider_submission_triggered: false,
      marketplace_scope_changed: false,
      auto_enforcement_triggered: false
    };

    const record = {
      review_id: reviewId,
      cohort_id: cohortId,
      tenant_id: tenantId,
      review_window_start: new Date(windowStart),
      review_window_end: new Date(windowEnd),
      reviewed_by: null,
      review_status: 'DRAFT',
      risk_level: 'LOW',
      confidence_level: 'HIGH',
      non_mutation_attestation_json: attestation,
      created_at: new Date(),
      updated_at: new Date(),
      finalized_at: null,
      superseded_at: null,
      superseded_by_review_id: null,
      superseded_reason: null
    };

    if (!isProdLike) {
      this._mockState.reviews.set(reviewId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_activity_reviews 
         (review_id, cohort_id, tenant_id, review_window_start, review_window_end, review_status, risk_level, confidence_level, non_mutation_attestation_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.review_id, record.cohort_id, record.tenant_id, record.review_window_start, record.review_window_end, record.review_status, record.risk_level, record.confidence_level, JSON.stringify(record.non_mutation_attestation_json)]
      );
    }

    // Trigger initial observations aggregation
    const snapshot = await aggregator.aggregateCohortObservations(tenantId, cohortId, windowStart, windowEnd);

    // Save aggregated findings as draft reviews findings mapping
    await auditService.recordAuditEvent(reviewId, 'REVIEW_CREATED', 'system', { window_start: windowStart, window_end: windowEnd });

    return {
      review: record,
      snapshot
    };
  }

  async evaluateReview(reviewId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let review = null;
    if (!isProdLike) {
      review = this._mockState.reviews.get(reviewId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_runtime_activity_reviews WHERE review_id = ?", [reviewId]);
      if (list.length > 0) review = list[0];
    }
    if (!review) throw new Error('Review not found');
    if (review.review_status === 'FINALIZED') throw new Error('Cannot evaluate finalized review');

    const { payload, inputSnapshotHash } = await aggregator.aggregateCohortObservations(
      review.tenant_id,
      review.cohort_id,
      review.review_window_start,
      review.review_window_end
    );
    // Add inputSnapshotHash to payload
    payload.inputSnapshotHash = inputSnapshotHash;

    const { evaluationResult, evaluationResultHash } = await evaluator.evaluateCohortHealth(payload);

    // Create decision recommendation record
    const decisionId = 'dec_' + crypto.randomBytes(8).toString('hex');
    const decisionRecord = {
      decision_id: decisionId,
      review_id: reviewId,
      recommended_decision: evaluationResult.recommendedDecision,
      decision_execution_status: 'NOT_EXECUTED_REVIEW_ONLY',
      execution_blocked_reason: 'PHASE_137_IS_READONLY_RECOMMENDATION_GATE',
      rationale: `System evaluated cohort health under Phase 137. Risk: ${evaluationResult.riskLevel}`,
      created_at: new Date()
    };

    // Save findings
    const findingsList = [];
    if (!isProdLike) {
      this._mockState.decisions.set(reviewId, decisionRecord);
      this._mockState.findings.set(reviewId, []);
      for (const f of evaluationResult.findings) {
        const fid = 'fnd_' + crypto.randomBytes(8).toString('hex');
        const frec = {
          finding_id: fid,
          review_id: reviewId,
          finding_key: f.finding_key,
          severity: f.severity,
          details_json: f.details_json,
          created_at: new Date()
        };
        this._mockState.findings.get(reviewId).push(frec);
        findingsList.push(frec);
      }

      review.risk_level = evaluationResult.riskLevel;
      review.confidence_level = evaluationResult.confidenceLevel;
      review.review_status = 'READY_FOR_REVIEW';
      this._mockState.reviews.set(reviewId, review);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_activity_review_decisions 
         (decision_id, review_id, recommended_decision, decision_execution_status, execution_blocked_reason, rationale)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE recommended_decision = VALUES(recommended_decision), rationale = VALUES(rationale)`,
        [decisionRecord.decision_id, decisionRecord.review_id, decisionRecord.recommended_decision, decisionRecord.decision_execution_status, decisionRecord.execution_blocked_reason, decisionRecord.rationale]
      );

      // Clean existing findings for this review before inserting updated evaluation findings
      await db.query("DELETE FROM controlled_beta_runtime_activity_review_findings WHERE review_id = ?", [reviewId]);
      for (const f of evaluationResult.findings) {
        const fid = 'fnd_' + crypto.randomBytes(8).toString('hex');
        const frec = {
          finding_id: fid,
          review_id: reviewId,
          finding_key: f.finding_key,
          severity: f.severity,
          details_json: f.details_json,
          created_at: new Date()
        };
        await db.query(
          "INSERT INTO controlled_beta_runtime_activity_review_findings (finding_id, review_id, finding_key, severity, details_json) VALUES (?, ?, ?, ?, ?)",
          [frec.finding_id, frec.review_id, frec.finding_key, frec.severity, JSON.stringify(frec.details_json)]
        );
        findingsList.push(frec);
      }

      await db.query(
        "UPDATE controlled_beta_runtime_activity_reviews SET risk_level = ?, confidence_level = ?, review_status = 'READY_FOR_REVIEW' WHERE review_id = ?",
        [evaluationResult.riskLevel, evaluationResult.confidenceLevel, reviewId]
      );
    }

    await auditService.recordAuditEvent(reviewId, 'REVIEW_EVALUATED', 'system', { risk_level: evaluationResult.riskLevel });

    return {
      evaluationResult,
      decision: decisionRecord,
      findings: findingsList
    };
  }

  async finalizeReview(reviewId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let review = null;
    let decision = null;
    let findings = [];

    if (!isProdLike) {
      review = this._mockState.reviews.get(reviewId);
      decision = this._mockState.decisions.get(reviewId);
      findings = this._mockState.findings.get(reviewId) || [];
    } else {
      const reviews = await db.query("SELECT * FROM controlled_beta_runtime_activity_reviews WHERE review_id = ?", [reviewId]);
      if (reviews.length > 0) review = reviews[0];
      const decisions = await db.query("SELECT * FROM controlled_beta_runtime_activity_review_decisions WHERE review_id = ?", [reviewId]);
      if (decisions.length > 0) decision = decisions[0];
      findings = await db.query("SELECT * FROM controlled_beta_runtime_activity_review_findings WHERE review_id = ?", [reviewId]);
    }

    if (!review) throw new Error('Review not found');
    if (review.review_status === 'FINALIZED') throw new Error('Review already finalized');

    // Strict checks for finalization
    if (!decision) {
      throw new Error('EVALUATION_MISSING_CANNOT_FINALIZE');
    }

    // Pull snapshot data to compile evidence pack
    const { payload, inputSnapshotHash } = await aggregator.aggregateCohortObservations(
      review.tenant_id,
      review.cohort_id,
      review.review_window_start,
      review.review_window_end
    );
    payload.inputSnapshotHash = inputSnapshotHash;

    const evaluationWrapper = {
      evaluationResult: {
        findings: findings.map(f => ({ finding_key: f.finding_key, severity: f.severity, details_json: f.details_json })),
        riskLevel: review.risk_level,
        confidenceLevel: review.confidence_level,
        recommendedDecision: decision.recommended_decision
      },
      evaluationResultHash: crypto.createHash('sha256').update(JSON.stringify({
        findings: findings.map(f => ({ finding_key: f.finding_key, severity: f.severity, details_json: f.details_json })),
        riskLevel: review.risk_level,
        confidenceLevel: review.confidence_level,
        recommendedDecision: decision.recommended_decision
      })).digest('hex')
    };

    const evidencePack = await evidenceService.buildEvidencePack(reviewId, payload, evaluationWrapper, decision, findings);

    if (!isProdLike) {
      review.review_status = 'FINALIZED';
      review.reviewed_by = actorId;
      review.finalized_at = new Date();
      this._mockState.reviews.set(reviewId, review);
    } else {
      await db.query(
        "UPDATE controlled_beta_runtime_activity_reviews SET review_status = 'FINALIZED', reviewed_by = ?, finalized_at = NOW() WHERE review_id = ?",
        [actorId, reviewId]
      );
      const updatedList = await db.query("SELECT * FROM controlled_beta_runtime_activity_reviews WHERE review_id = ?", [reviewId]);
      if (updatedList.length > 0) {
        review = updatedList[0];
      }
    }

    await auditService.recordAuditEvent(reviewId, 'REVIEW_FINALIZED', actorId, { evidence_pack_hash: evidencePack.evidence_pack_hash });

    return {
      review,
      evidencePack
    };
  }

  async supersedeReview(reviewId, supersededByReviewId, reason, actorId) {
    if (!reason || reason.trim() === '') {
      throw new Error('SUPERSEDE_REASON_EXIGENTLY_REQUIRED');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let review = null;
    if (!isProdLike) {
      review = this._mockState.reviews.get(reviewId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_runtime_activity_reviews WHERE review_id = ?", [reviewId]);
      if (list.length > 0) review = list[0];
    }

    if (!review) throw new Error('Review not found');

    if (!isProdLike) {
      review.review_status = 'SUPERSEDED';
      review.superseded_at = new Date();
      review.superseded_by_review_id = supersededByReviewId;
      review.superseded_reason = reason;
      this._mockState.reviews.set(reviewId, review);
    } else {
      await db.query(
        "UPDATE controlled_beta_runtime_activity_reviews SET review_status = 'SUPERSEDED', superseded_at = NOW(), superseded_by_review_id = ?, superseded_reason = ? WHERE review_id = ?",
        [supersededByReviewId, reason, reviewId]
      );
    }

    await auditService.recordAuditEvent(reviewId, 'REVIEW_SUPERSEDED', actorId, { superseded_by_review_id: supersededByReviewId, reason });

    return { ok: true };
  }
}

const serviceInstance = new RuntimeActivityReviewDecisionService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.RuntimeActivityReviewDecisionService = RuntimeActivityReviewDecisionService;
