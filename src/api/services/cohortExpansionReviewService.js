const crypto = require('crypto');
const CohortExpansionAuditService = require('./cohortExpansionAuditService');
const BetaFunnelAggregationService = require('./betaFunnelAggregationService');

class CohortExpansionReviewService {
    constructor(dependencies = {}) {
        this.auditService = dependencies.cohortExpansionAuditService || new CohortExpansionAuditService();
        this.aggregationService = dependencies.betaFunnelAggregationService || new BetaFunnelAggregationService();
        this._mockReviews = [];
    }

    _assertRole(actor) {
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN'].includes(actor.role)) {
            throw new Error('Unauthorized');
        }
    }

    async requestExpansionReview({ cohortId, tenantId, notes, actor }) {
        this._assertRole(actor);

        const healthSnapshot = await this.aggregationService.computeBetaFunnel({ cohortId, tenantId, actor });

        const review = {
            id: `cer_${crypto.randomUUID()}`,
            tenant_id: tenantId,
            cohort_id: cohortId,
            review_status: 'PENDING_REVIEW',
            review_decision: null,
            review_notes: notes,
            health_snapshot_json: healthSnapshot,
            hardening_snapshot_json: null, // Populated during gating phase
            created_by: actor.userId,
            created_by_role: actor.role,
            reviewed_by: null,
            reviewed_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        this._mockReviews.push(review);

        await this.auditService.recordExpansionEvent({
            tenant_id: tenantId,
            cohort_id: cohortId,
            expansion_review_id: review.id,
            event_type: 'EXPANSION_REVIEW_REQUESTED',
            metadata_json: { notes },
            actor
        });

        return review;
    }

    async recordExpansionDecision({ reviewId, decision, notes, actor }) {
        this._assertRole(actor);
        const validDecisions = [
            'HOLD',
            'CONTINUE_BETA',
            'HARDENING_REQUIRED',
            'EXPAND_COHORT_REVIEW',
            'APPROVED_FOR_LIMITED_EXPANSION',
            'DO_NOT_EXPAND',
            'PAUSE_BETA',
            'ROLLBACK_RECOMMENDED'
        ];

        if (!validDecisions.includes(decision)) {
            throw new Error(`Invalid decision: ${decision}`);
        }

        const review = this._mockReviews.find(r => r.id === reviewId);
        if (!review) throw new Error('Review not found');

        review.review_status = 'DECISION_RECORDED';
        review.review_decision = decision;
        review.review_notes = notes || review.review_notes;
        review.reviewed_by = actor.userId;
        review.reviewed_at = new Date().toISOString();
        review.updated_at = new Date().toISOString();

        await this.auditService.recordExpansionEvent({
            tenant_id: review.tenant_id,
            cohort_id: review.cohort_id,
            expansion_review_id: review.id,
            event_type: 'EXPANSION_DECISION_RECORDED',
            metadata_json: { decision, notes },
            actor
        });

        // NOTE: This does NOT automatically expand the cohort or enable FULL_PUBLIC.
        // It merely records the decision for audit and potential manual execution.
        return review;
    }

    async getExpansionReview({ reviewId, actor }) {
        this._assertRole(actor);
        const review = this._mockReviews.find(r => r.id === reviewId);
        if (!review) throw new Error('Review not found');
        return review;
    }

    async listExpansionReviews(filters, actor) {
        this._assertRole(actor);
        let filtered = this._mockReviews;
        if (filters.tenant_id) filtered = filtered.filter(r => r.tenant_id === filters.tenant_id);
        if (filters.cohort_id) filtered = filtered.filter(r => r.cohort_id === filters.cohort_id);
        return filtered;
    }
}

module.exports = CohortExpansionReviewService;
