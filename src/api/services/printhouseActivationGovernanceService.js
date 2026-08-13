/**
 * src/api/services/printhouseActivationGovernanceService.js
 * 
 * Phase 191H: Controlled Activation Governance Service.
 * Performs explicit, atomic transactional capability grants (Marketplace Visibility,
 * Live Quoting Allowed, Job Routing Allowed, Production Dispatch Allowed).
 * 
 * Requires an APPROVED marketplace review. Prevents partial activation.
 */
const crypto = require('crypto');
const db = require('./mysqlClient');
const reviewService = require('./printhouseMarketplaceReviewService');
const readinessService = require('./printhouseReadinessService');

class PrinthouseActivationGovernanceService {

    async activateMarketplaceNode(reviewId, actor, options = {}) {
        const review = await reviewService.getReviewById(null, reviewId);

        if (review.status !== 'APPROVED') {
            const err = new Error(`INVALID_ACTIVATION_STATE: Review '${reviewId}' has status '${review.status}'. Only APPROVED reviews can be activated.`);
            err.code = 'INVALID_ACTIVATION_STATE';
            err.statusCode = 400;
            throw err;
        }

        // Reverify critical readiness
        const readiness = await readinessService.computeOperationalReadiness(review.tenantId, review.siteId);
        const blockers = [...(readiness.accountSetup?.blockingIssues || []), ...(readiness.operationalConfiguration?.blockingIssues || [])];
        if (blockers.length > 0) {
            const err = new Error(`CRITICAL_READINESS_FAILED: Recomputed readiness contains ${blockers.length} blocking issues.`);
            err.code = 'CRITICAL_READINESS_FAILED';
            err.statusCode = 400;
            throw err;
        }

        // Check if active grant already exists (idempotency)
        const existingGrants = await db.query(
            'SELECT * FROM printhouse_activation_grants WHERE review_id = ? AND status = "ACTIVE"',
            [reviewId]
        );

        if (existingGrants && existingGrants.length > 0) {
            return this._formatGrantRow(existingGrants[0]);
        }

        const grantId = `actgrant_${crypto.randomUUID()}`;
        const grantedBy = actor || { role: 'SUPER_ADMIN' };

        const marketplaceVisible = options.marketplaceVisible !== undefined ? options.marketplaceVisible : true;
        const liveQuotingAllowed = options.liveQuotingAllowed !== undefined ? options.liveQuotingAllowed : true;
        const jobRoutingAllowed = options.jobRoutingAllowed !== undefined ? options.jobRoutingAllowed : true;
        const productionDispatchAllowed = options.productionDispatchAllowed !== undefined ? options.productionDispatchAllowed : true;

        const query = `
            INSERT INTO printhouse_activation_grants
            (id, review_id, tenant_id, site_id, granted_by_json, marketplace_visible, live_quoting_allowed, job_routing_allowed, production_dispatch_allowed, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `;

        await db.query(query, [
            grantId, reviewId, review.tenantId, review.siteId || null,
            JSON.stringify(grantedBy), marketplaceVisible, liveQuotingAllowed,
            jobRoutingAllowed, productionDispatchAllowed
        ]);

        await db.query(
            'INSERT INTO printhouse_marketplace_review_audits (id, tenant_id, review_id, action, actor_json, changes_json) VALUES (?, ?, ?, ?, ?, ?)',
            [
                `mpaud_${crypto.randomUUID()}`, review.tenantId, reviewId, 'ACTIVATION_GRANTED',
                JSON.stringify(grantedBy),
                JSON.stringify({ grantId, marketplaceVisible, liveQuotingAllowed, jobRoutingAllowed, productionDispatchAllowed })
            ]
        );

        const rows = await db.query('SELECT * FROM printhouse_activation_grants WHERE id = ?', [grantId]);
        return this._formatGrantRow(rows[0]);
    }

    async getActivationStatus(tenantId) {
        const rows = await db.query(
            'SELECT * FROM printhouse_activation_grants WHERE tenant_id = ? ORDER BY granted_at DESC LIMIT 1',
            [tenantId]
        );
        if (!rows || rows.length === 0) {
            return {
                status: 'NOT_ACTIVATED',
                marketplaceVisible: false,
                liveQuotingAllowed: false,
                jobRoutingAllowed: false,
                productionDispatchAllowed: false
            };
        }
        return this._formatGrantRow(rows[0]);
    }

    async suspendActivation(tenantId, reasonCode, actor) {
        const rows = await db.query(
            'SELECT * FROM printhouse_activation_grants WHERE tenant_id = ? AND status = "ACTIVE"',
            [tenantId]
        );

        if (!rows || rows.length === 0) {
            return { status: 'NO_ACTIVE_GRANTS' };
        }

        await db.query(
            'UPDATE printhouse_activation_grants SET status = "SUSPENDED" WHERE tenant_id = ? AND status = "ACTIVE"',
            [tenantId]
        );

        await db.query(
            'INSERT INTO printhouse_marketplace_review_audits (id, tenant_id, review_id, action, actor_json, changes_json) VALUES (?, ?, ?, ?, ?, ?)',
            [
                `mpaud_${crypto.randomUUID()}`, tenantId, rows[0].review_id, 'ACTIVATION_SUSPENDED',
                JSON.stringify(actor || { role: 'SUPER_ADMIN' }),
                JSON.stringify({ reasonCode: reasonCode || 'ADMIN_SUSPENSION' })
            ]
        );

        return { status: 'SUSPENDED', suspendedCount: rows.length };
    }

    _formatGrantRow(r) {
        let grantedBy = null;
        try { grantedBy = typeof r.granted_by_json === 'string' ? JSON.parse(r.granted_by_json) : r.granted_by_json; } catch (e) {}

        const isActive = r.status === 'ACTIVE';

        return {
            id: r.id,
            reviewId: r.review_id,
            tenantId: r.tenant_id,
            siteId: r.site_id,
            grantedBy,
            marketplaceVisible: Boolean(r.marketplace_visible) && isActive,
            liveQuotingAllowed: Boolean(r.live_quoting_allowed) && isActive,
            jobRoutingAllowed: Boolean(r.job_routing_allowed) && isActive,
            productionDispatchAllowed: Boolean(r.production_dispatch_allowed) && isActive,
            status: r.status,
            grantedAt: r.granted_at,
            updatedAt: r.updated_at
        };
    }
}

module.exports = new PrinthouseActivationGovernanceService();
