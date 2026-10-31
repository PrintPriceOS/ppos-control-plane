'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const reviewDecisionService = require('./runtimeActivityReviewDecisionService');
const evidencePackServicePhase137 = require('./runtimeActivityReviewEvidencePackService');
const plannerService = require('./cohortInterventionPreparationPlannerService');
const auditService = require('./cohortInterventionPreparationAuditService');

class CohortInterventionPreparationBuilderService {
  constructor() {
    this._mockState = {
      preparations: new Map(),
      items: new Map()
    };
  }

  async getReviewById(reviewId, isProdLike) {
    if (!isProdLike) {
      return reviewDecisionService._mockState.reviews.get(reviewId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_runtime_activity_reviews WHERE review_id = ?", [reviewId]);
      return list.length > 0 ? list[0] : null;
    }
  }

  async getDecisionByReviewId(reviewId, isProdLike) {
    if (!isProdLike) {
      // Find the decision record associated with the reviewId
      for (const d of reviewDecisionService._mockState.decisions.values()) {
        if (d.review_id === reviewId) return d;
      }
      // Or look it up directly if keyed by reviewId
      return reviewDecisionService._mockState.decisions.get(reviewId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_runtime_activity_review_decisions WHERE review_id = ?", [reviewId]);
      return list.length > 0 ? list[0] : null;
    }
  }

  async getEvidenceByReviewId(reviewId, isProdLike) {
    if (!isProdLike) {
      return evidencePackServicePhase137._mockState.evidence.get(reviewId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_runtime_activity_review_evidence WHERE review_id = ?", [reviewId]);
      return list.length > 0 ? list[0] : null;
    }
  }

  async createPreparation(reviewId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const review = await this.getReviewById(reviewId, isProdLike);
    if (!review) {
      throw new Error('REVIEW_NOT_FOUND');
    }

    if (review.review_status !== 'FINALIZED') {
      throw new Error('REVIEW_NOT_FINALIZED_CANNOT_PREPARE');
    }

    const decision = await this.getDecisionByReviewId(reviewId, isProdLike);
    if (!decision) {
      throw new Error('REVIEW_DECISION_MISSING');
    }

    const evidence = await this.getEvidenceByReviewId(reviewId, isProdLike);
    if (!evidence) {
      throw new Error('REVIEW_EVIDENCE_MISSING');
    }

    // Determine the lineage hashes from Phase 137 evidence
    const sourceEvidencePackHash = evidence.evidence_pack_hash || 'hash_placeholder';
    const sourceEvaluationResultHash = evidence.evaluation_result_hash || 'hash_placeholder';
    const sourceInputSnapshotHash = evidence.input_snapshot_hash || 'hash_placeholder';

    // Compute input review hash
    const reviewPayload = {
      review_id: review.review_id,
      cohort_id: review.cohort_id,
      tenant_id: review.tenant_id,
      review_status: review.review_status,
      risk_level: review.risk_level,
      confidence_level: review.confidence_level,
      review_window_start: review.review_window_start,
      review_window_end: review.review_window_end
    };
    const inputReviewHash = crypto.createHash('sha256').update(JSON.stringify(reviewPayload)).digest('hex');

    // Call planner to structure template
    const plan = plannerService.planIntervention(decision.recommended_decision);

    const preparationId = 'prp_' + crypto.randomBytes(8).toString('hex');
    const defaultAttestation = {
      non_execution_acknowledged: true,
      readiness_only_attested: true,
      timestamp: new Date().toISOString(),
      attested_by: actorId
    };

    const defaultBlockers = {
      missing_evidence_pack: true, // starts with true until finalized/evidence built
      missing_required_approvals: true,
      non_execution_attestation_invalid: false,
      guardrail_failed: false,
      source_review_not_finalized: false
    };

    const record = {
      preparation_id: preparationId,
      source_review_id: reviewId,
      cohort_id: review.cohort_id,
      tenant_id: review.tenant_id,
      recommended_decision_from_phase137: decision.recommended_decision,
      preparation_type: plan.preparationType,
      preparation_status: 'DRAFT',
      preparation_execution_status: 'NOT_EXECUTED_PREPARATION_ONLY',
      source_review_evidence_pack_hash: sourceEvidencePackHash,
      source_review_evaluation_result_hash: sourceEvaluationResultHash,
      source_review_input_snapshot_hash: sourceInputSnapshotHash,
      finalization_blockers_json: defaultBlockers,
      risk_level: review.risk_level,
      confidence_level: review.confidence_level,
      prepared_by: actorId,
      reviewed_by: null,
      preparation_window_start: review.review_window_start,
      preparation_window_end: review.review_window_end,
      intervention_summary_json: { summary: plan.summary },
      proposed_actions_json: plan.proposedActions,
      required_approvals_json: plan.requiredApprovals.map(role => ({ role, approved: false, approved_by: null })),
      rollback_considerations_json: plan.rollbackConsiderations,
      communication_plan_json: plan.communicationPlan,
      non_execution_attestation_json: defaultAttestation,
      created_at: new Date(),
      updated_at: new Date(),
      reviewed_at: null,
      finalized_at: null,
      superseded_at: null,
      superseded_by_preparation_id: null,
      superseded_reason: null,
      rejected_at: null,
      rejected_reason: null
    };

    const checklistItems = plan.proposedActions.map(action => ({
      item_id: 'itm_' + crypto.randomBytes(8).toString('hex'),
      preparation_id: preparationId,
      action_key: action.action_key,
      description: action.description,
      item_status: 'PENDING',
      created_at: new Date()
    }));

    if (!isProdLike) {
      this._mockState.preparations.set(preparationId, record);
      this._mockState.items.set(preparationId, checklistItems);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_preparations
         (preparation_id, source_review_id, cohort_id, tenant_id, recommended_decision_from_phase137,
          preparation_type, preparation_status, preparation_execution_status, source_review_evidence_pack_hash,
          source_review_evaluation_result_hash, source_review_input_snapshot_hash, finalization_blockers_json,
          risk_level, confidence_level, prepared_by, preparation_window_start, preparation_window_end,
          intervention_summary_json, proposed_actions_json, required_approvals_json, rollback_considerations_json,
          communication_plan_json, non_execution_attestation_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.preparation_id, record.source_review_id, record.cohort_id, record.tenant_id, record.recommended_decision_from_phase137,
          record.preparation_type, record.preparation_status, record.preparation_execution_status, record.source_review_evidence_pack_hash,
          record.source_review_evaluation_result_hash, record.source_review_input_snapshot_hash, JSON.stringify(record.finalization_blockers_json),
          record.risk_level, record.confidence_level, record.prepared_by, record.preparation_window_start, record.preparation_window_end,
          JSON.stringify(record.intervention_summary_json), JSON.stringify(record.proposed_actions_json), JSON.stringify(record.required_approvals_json), JSON.stringify(record.rollback_considerations_json),
          JSON.stringify(record.communication_plan_json), JSON.stringify(record.non_execution_attestation_json)
        ]
      );

      for (const item of checklistItems) {
        await db.query(
          `INSERT INTO controlled_beta_cohort_intervention_preparation_items
           (item_id, preparation_id, action_key, description, item_status)
           VALUES (?, ?, ?, ?, ?)`,
          [item.item_id, item.preparation_id, item.action_key, item.description, item.item_status]
        );
      }
    }

    await auditService.recordAuditEvent(preparationId, 'PREPARATION_CREATED', actorId, {
      source_review_id: reviewId,
      preparation_type: record.preparation_type
    });

    return {
      preparation: record,
      items: checklistItems,
      inputReviewHash
    };
  }
}

const serviceInstance = new CohortInterventionPreparationBuilderService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionPreparationBuilderService = CohortInterventionPreparationBuilderService;
