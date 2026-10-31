/**
 * src/api/services/printhouseMarketplaceReviewService.js
 * 
 * Phase 191H: Printhouse Marketplace Governed Review Service.
 * Handles readiness facts aggregation, immutable evidence snapshot creation,
 * submission for review, and admin lifecycle transitions:
 *   DRAFT -> READY_FOR_REVIEW -> UNDER_REVIEW -> APPROVED / CHANGES_REQUESTED / REJECTED / SUSPENDED
 * 
 * Approval produces MARKETPLACE_APPROVED: true, but does NOT auto-activate live production routing.
 */
const crypto = require('crypto');
const db = require('./mysqlClient');
const readinessService = require('./printhouseReadinessService');

const PROTECTED_FIELDS = [
    'review_status', 'approved', 'approved_by', 'approved_at', 'rejected', 'rejected_by',
    'activation_status', 'marketplace_enabled', 'marketplace_visible', 'live_quoting_enabled',
    'routing_enabled', 'production_enabled', 'suspended', 'reviewer_id', 'activation_grants'
];

class PrinthouseMarketplaceReviewService {

    static validateNoProtectedFields(payload) {
        if (!payload || typeof payload !== 'object') return;
        for (const field of PROTECTED_FIELDS) {
            if (field in payload) {
                const err = new Error(`FIELD_NOT_EDITABLE: Self-service mutation of protected governance field '${field}' is strictly forbidden.`);
                err.code = 'FIELD_NOT_EDITABLE';
                err.statusCode = 400;
                throw err;
            }
        }
    }

    async submitForReview(tenantId, siteId = null, actor = null) {
        // Recompute readiness across all onboarding modules
        const readiness = await readinessService.computeOperationalReadiness(tenantId, siteId);
        
        const blockers = readiness.accountSetup?.blockingIssues || [];
        const opBlockers = readiness.operationalConfiguration?.blockingIssues || [];
        const allBlockers = [...blockers, ...opBlockers];

        if (allBlockers.length > 0) {
            const err = new Error(`MARKETPLACE_READINESS_INCOMPLETE: Cannot submit for review. ${allBlockers.length} blocking issues remain.`);
            err.code = 'MARKETPLACE_READINESS_INCOMPLETE';
            err.statusCode = 400;
            err.details = allBlockers;
            throw err;
        }

        // Check if an active review is already under evaluation
        const existing = await db.query(
            'SELECT id, status FROM printhouse_marketplace_reviews WHERE tenant_id = ? AND status IN ("READY_FOR_REVIEW", "UNDER_REVIEW")',
            [tenantId]
        );

        if (existing && existing.length > 0) {
            const err = new Error('REVIEW_ALREADY_SUBMITTED: A review is already active for this tenant.');
            err.code = 'REVIEW_ALREADY_SUBMITTED';
            err.statusCode = 400;
            throw err;
        }

        const reviewId = `mprev_${crypto.randomUUID()}`;
        const submittedBy = actor || { role: 'PRINTHOUSE_ADMIN', tenantId };

        const query = `
            INSERT INTO printhouse_marketplace_reviews
            (id, tenant_id, site_id, readiness_version, status, submitted_by_json, submitted_at)
            VALUES (?, ?, ?, '191H_v1', 'READY_FOR_REVIEW', ?, NOW())
        `;

        await db.query(query, [reviewId, tenantId, siteId || null, JSON.stringify(submittedBy)]);

        // Create Immutable Evidence Snapshot
        const snapshotData = {
            tenantId,
            siteId: siteId || 'all-sites',
            submittedAt: new Date().toISOString(),
            readinessSummary: {
                accountSetupStatus: readiness.accountSetup?.status,
                operationalConfigStatus: readiness.operationalConfiguration?.status,
                pricingStatus: readiness.pricingReadiness?.status,
                shippingStatus: readiness.shippingReadiness?.status,
                integrationStatus: readiness.integrationReadiness?.status,
                machineCount: readiness.operationalConfiguration?.machineCount || 0,
                capabilityCount: readiness.operationalConfiguration?.capabilityCount || 0,
                materialCount: readiness.operationalConfiguration?.materialCount || 0
            },
            nonBindingNote: 'Submission snapshot recorded cleanly. Live production routing remains DISABLED until admin approval and controlled activation.'
        };

        const snapshotJson = JSON.stringify(snapshotData);
        const snapshotHash = crypto.createHash('sha256').update(snapshotJson).digest('hex');
        const snapshotId = `rsnap_${crypto.randomUUID()}`;

        await db.query(
            'INSERT INTO printhouse_review_snapshots (id, review_id, tenant_id, snapshot_hash, snapshot_json) VALUES (?, ?, ?, ?, ?)',
            [snapshotId, reviewId, tenantId, snapshotHash, snapshotJson]
        );

        await this._recordAudit(tenantId, reviewId, 'SUBMITTED_FOR_REVIEW', submittedBy, { reviewId, snapshotHash });

        return this.getReviewById(tenantId, reviewId);
    }

    async getReviewStatus(tenantId) {
        const rows = await db.query(
            'SELECT * FROM printhouse_marketplace_reviews WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1',
            [tenantId]
        );
        if (!rows || rows.length === 0) {
            return {
                status: 'DRAFT',
                message: 'Onboarding in progress. Submit for review when all 6 modules are complete.'
            };
        }
        return this._formatReviewRow(rows[0]);
    }

    async getReviewById(tenantId, reviewId) {
        const query = tenantId 
            ? 'SELECT * FROM printhouse_marketplace_reviews WHERE id = ? AND tenant_id = ?'
            : 'SELECT * FROM printhouse_marketplace_reviews WHERE id = ?';
        const params = tenantId ? [reviewId, tenantId] : [reviewId];

        const rows = await db.query(query, params);
        if (!rows || rows.length === 0) {
            const err = new Error('NOT_FOUND: Marketplace review not found');
            err.statusCode = 404;
            throw err;
        }

        const review = this._formatReviewRow(rows[0]);
        const snapRows = await db.query('SELECT * FROM printhouse_review_snapshots WHERE review_id = ?', [reviewId]);
        if (snapRows && snapRows.length > 0) {
            review.snapshot = {
                id: snapRows[0].id,
                snapshotHash: snapRows[0].snapshot_hash,
                snapshotData: typeof snapRows[0].snapshot_json === 'string' ? JSON.parse(snapRows[0].snapshot_json) : snapRows[0].snapshot_json
            };
        }
        return review;
    }

    async listReviewQueue(statusFilter = null) {
        let query = 'SELECT * FROM printhouse_marketplace_reviews';
        const params = [];
        if (statusFilter) {
            query += ' WHERE status = ?';
            params.push(statusFilter);
        }
        query += ' ORDER BY created_at DESC';
        const rows = await db.query(query, params);
        return rows.map(r => this._formatReviewRow(r));
    }

    async startReview(reviewId, reviewerActor) {
        const review = await this.getReviewById(null, reviewId);
        if (review.status !== 'READY_FOR_REVIEW') {
            throw new Error(`INVALID_TRANSITION: Cannot start review from status '${review.status}'`);
        }

        await db.query(
            'UPDATE printhouse_marketplace_reviews SET status = "UNDER_REVIEW", reviewed_by_json = ?, reviewed_at = NOW() WHERE id = ?',
            [JSON.stringify(reviewerActor), reviewId]
        );

        await this._recordAudit(review.tenantId, reviewId, 'REVIEW_STARTED', reviewerActor, {});
        return this.getReviewById(null, reviewId);
    }

    async requestChanges(reviewId, reasonCode, explanation, reviewerActor) {
        const review = await this.getReviewById(null, reviewId);
        if (!['READY_FOR_REVIEW', 'UNDER_REVIEW'].includes(review.status)) {
            throw new Error(`INVALID_TRANSITION: Cannot request changes from status '${review.status}'`);
        }

        await db.query(
            'UPDATE printhouse_marketplace_reviews SET status = "CHANGES_REQUESTED", reason_code = ?, explanation = ?, reviewed_by_json = ?, reviewed_at = NOW() WHERE id = ?',
            [reasonCode || 'CHANGES_REQUIRED', explanation || 'Additional information required', JSON.stringify(reviewerActor), reviewId]
        );

        await this._recordAudit(review.tenantId, reviewId, 'CHANGES_REQUESTED', reviewerActor, { reasonCode, explanation });
        return this.getReviewById(null, reviewId);
    }

    async approveReview(reviewId, reviewerActor) {
        const review = await this.getReviewById(null, reviewId);
        if (!['READY_FOR_REVIEW', 'UNDER_REVIEW'].includes(review.status)) {
            throw new Error(`INVALID_TRANSITION: Cannot approve review from status '${review.status}'`);
        }

        await db.query(
            'UPDATE printhouse_marketplace_reviews SET status = "APPROVED", reason_code = "APPROVED_BY_ADMIN", reviewed_by_json = ?, reviewed_at = NOW() WHERE id = ?',
            [JSON.stringify(reviewerActor), reviewId]
        );

        await this._recordAudit(review.tenantId, reviewId, 'REVIEW_APPROVED', reviewerActor, {
            marketplaceApproved: true,
            productionRoutingEnabled: false // EXPLICIT SAFETY MARKER
        });

        return this.getReviewById(null, reviewId);
    }

    async rejectReview(reviewId, reasonCode, explanation, reviewerActor) {
        const review = await this.getReviewById(null, reviewId);
        await db.query(
            'UPDATE printhouse_marketplace_reviews SET status = "REJECTED", reason_code = ?, explanation = ?, reviewed_by_json = ?, reviewed_at = NOW() WHERE id = ?',
            [reasonCode || 'REJECTED_BY_ADMIN', explanation || 'Marketplace review rejected', JSON.stringify(reviewerActor), reviewId]
        );

        await this._recordAudit(review.tenantId, reviewId, 'REVIEW_REJECTED', reviewerActor, { reasonCode, explanation });
        return this.getReviewById(null, reviewId);
    }

    async suspendReview(reviewId, reasonCode, explanation, reviewerActor) {
        const review = await this.getReviewById(null, reviewId);
        await db.query(
            'UPDATE printhouse_marketplace_reviews SET status = "SUSPENDED", reason_code = ?, explanation = ?, reviewed_by_json = ?, reviewed_at = NOW() WHERE id = ?',
            [reasonCode || 'SUSPENDED_BY_ADMIN', explanation || 'Marketplace review suspended', JSON.stringify(reviewerActor), reviewId]
        );

        await this._recordAudit(review.tenantId, reviewId, 'REVIEW_SUSPENDED', reviewerActor, { reasonCode, explanation });
        return this.getReviewById(null, reviewId);
    }

    _formatReviewRow(r) {
        let submittedBy = null;
        let reviewedBy = null;
        try { submittedBy = typeof r.submitted_by_json === 'string' ? JSON.parse(r.submitted_by_json) : r.submitted_by_json; } catch (e) {}
        try { reviewedBy = typeof r.reviewed_by_json === 'string' ? JSON.parse(r.reviewed_by_json) : r.reviewed_by_json; } catch (e) {}

        return {
            id: r.id,
            tenantId: r.tenant_id,
            siteId: r.site_id,
            readinessVersion: r.readiness_version,
            status: r.status,
            submittedBy,
            submittedAt: r.submitted_at,
            reviewedBy,
            reviewedAt: r.reviewed_at,
            reasonCode: r.reason_code,
            explanation: r.explanation,
            createdAt: r.created_at,
            updatedAt: r.updated_at
        };
    }

    async _recordAudit(tenantId, reviewId, action, actor, changes) {
        const auditId = `mpaud_${crypto.randomUUID()}`;
        const query = `
            INSERT INTO printhouse_marketplace_review_audits
            (id, tenant_id, review_id, action, actor_json, changes_json)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await db.query(query, [
            auditId, tenantId, reviewId, action,
            JSON.stringify(actor || { role: 'SYSTEM' }),
            JSON.stringify(changes || {})
        ]);
    }
}

module.exports = new PrinthouseMarketplaceReviewService();
