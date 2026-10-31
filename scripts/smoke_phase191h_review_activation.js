/**
 * scripts/smoke_phase191h_review_activation.js
 * 
 * Phase 191H: Service-Level Smoke Test for Marketplace Review & Controlled Activation.
 */
const assert = require('assert');
const db = require('../src/api/services/mysqlClient');

// In-memory mock DB fallback
const memoryTables = {
    printhouse_marketplace_reviews: new Map(),
    printhouse_review_snapshots: new Map(),
    printhouse_activation_grants: new Map(),
    printhouse_marketplace_review_audits: new Map()
};

const originalQuery = db.query;
db.query = async function mockOrRealQuery(sql, params = []) {
    try {
        return await originalQuery.call(db, sql, params);
    } catch (err) {
        if (err.code !== 'DB_UNCONFIGURED' && !err.message.includes('UNCONFIGURED')) {
            throw err;
        }

        const sqlTrim = sql.trim().toUpperCase();

        if (sqlTrim.startsWith('UPDATE PRINTHOUSE_MARKETPLACE_REVIEWS SET STATUS =')) {
            const reviewId = params[params.length - 1];
            const row = memoryTables.printhouse_marketplace_reviews.get(reviewId);
            if (row) {
                if (sqlTrim.includes('STATUS = "UNDER_REVIEW"')) {
                    row.status = 'UNDER_REVIEW';
                    row.reviewed_by_json = params[0];
                } else if (sqlTrim.includes('STATUS = "CHANGES_REQUESTED"')) {
                    row.status = 'CHANGES_REQUESTED';
                    row.reason_code = params[0];
                    row.explanation = params[1];
                    row.reviewed_by_json = params[2];
                } else if (sqlTrim.includes('STATUS = "APPROVED"')) {
                    row.status = 'APPROVED';
                    row.reason_code = params[0];
                    row.reviewed_by_json = params[1];
                } else if (sqlTrim.includes('STATUS = "REJECTED"')) {
                    row.status = 'REJECTED';
                    row.reason_code = params[0];
                    row.explanation = params[1];
                    row.reviewed_by_json = params[2];
                } else if (sqlTrim.includes('STATUS = "SUSPENDED"')) {
                    row.status = 'SUSPENDED';
                    row.reason_code = params[0];
                    row.explanation = params[1];
                    row.reviewed_by_json = params[2];
                }
            }
            return { affectedRows: 1 };
        }

        if (sqlTrim.startsWith('INSERT INTO PRINTHOUSE_MARKETPLACE_REVIEWS')) {
            const row = {
                id: params[0], tenant_id: params[1], site_id: params[2], readiness_version: '191H_v1',
                status: 'READY_FOR_REVIEW', submitted_by_json: params[3], submitted_at: new Date(),
                created_at: new Date(), updated_at: new Date()
            };
            memoryTables.printhouse_marketplace_reviews.set(row.id, row);
            return { affectedRows: 1 };
        }

        if (sqlTrim.includes('PRINTHOUSE_MARKETPLACE_REVIEWS')) {
            const rows = Array.from(memoryTables.printhouse_marketplace_reviews.values());
            if (sqlTrim.includes('WHERE ID = ?')) {
                return rows.filter(r => r.id === params[0] && (!params[1] || r.tenant_id === params[1]));
            }
            if (sqlTrim.includes('WHERE TENANT_ID = ? AND STATUS IN')) {
                return rows.filter(r => r.tenant_id === params[0] && ['READY_FOR_REVIEW', 'UNDER_REVIEW'].includes(r.status));
            }
            if (sqlTrim.includes('WHERE TENANT_ID = ?')) {
                return rows.filter(r => r.tenant_id === params[0]);
            }
            if (sqlTrim.includes('WHERE STATUS = ?')) {
                return rows.filter(r => r.status === params[0]);
            }
            return rows;
        }

        if (sqlTrim.startsWith('INSERT INTO PRINTHOUSE_REVIEW_SNAPSHOTS')) {
            const row = { id: params[0], review_id: params[1], tenant_id: params[2], snapshot_hash: params[3], snapshot_json: params[4], created_at: new Date() };
            memoryTables.printhouse_review_snapshots.set(row.id, row);
            return { affectedRows: 1 };
        }

        if (sqlTrim.includes('PRINTHOUSE_REVIEW_SNAPSHOTS')) {
            const rows = Array.from(memoryTables.printhouse_review_snapshots.values());
            return rows.filter(r => r.review_id === params[0]);
        }

        if (sqlTrim.startsWith('UPDATE PRINTHOUSE_ACTIVATION_GRANTS SET STATUS = "SUSPENDED"')) {
            const rows = Array.from(memoryTables.printhouse_activation_grants.values()).filter(r => r.tenant_id === params[0] && r.status === 'ACTIVE');
            rows.forEach(r => r.status = 'SUSPENDED');
            return { affectedRows: rows.length };
        }

        if (sqlTrim.startsWith('INSERT INTO PRINTHOUSE_ACTIVATION_GRANTS')) {
            const row = {
                id: params[0], review_id: params[1], tenant_id: params[2], site_id: params[3],
                granted_by_json: params[4], marketplace_visible: params[5], live_quoting_allowed: params[6],
                job_routing_allowed: params[7], production_dispatch_allowed: params[8], status: 'ACTIVE',
                granted_at: new Date(), updated_at: new Date()
            };
            memoryTables.printhouse_activation_grants.set(row.id, row);
            return { affectedRows: 1 };
        }

        if (sqlTrim.includes('PRINTHOUSE_ACTIVATION_GRANTS')) {
            const rows = Array.from(memoryTables.printhouse_activation_grants.values());
            if (sqlTrim.includes('WHERE REVIEW_ID = ? AND STATUS = "ACTIVE"')) {
                return rows.filter(r => r.review_id === params[0] && r.status === 'ACTIVE');
            }
            if (sqlTrim.includes('WHERE TENANT_ID = ? AND STATUS = "ACTIVE"')) {
                return rows.filter(r => r.tenant_id === params[0] && r.status === 'ACTIVE');
            }
            if (sqlTrim.includes('WHERE TENANT_ID = ?')) {
                return rows.filter(r => r.tenant_id === params[0]);
            }
            if (sqlTrim.includes('WHERE ID = ?')) {
                return rows.filter(r => r.id === params[0]);
            }
            return rows;
        }

        if (sqlTrim.startsWith('INSERT INTO PRINTHOUSE_MARKETPLACE_REVIEW_AUDITS')) {
            const row = { id: params[0], tenant_id: params[1], review_id: params[2], action: params[3], actor_json: params[4], changes_json: params[5], created_at: new Date() };
            memoryTables.printhouse_marketplace_review_audits.set(row.id, row);
            return { affectedRows: 1 };
        }

        return [];
    }
};

const reviewService = require('../src/api/services/printhouseMarketplaceReviewService');
const activationService = require('../src/api/services/printhouseActivationGovernanceService');
const readinessService = require('../src/api/services/printhouseReadinessService');

readinessService.computeOperationalReadiness = async function mockCompute() {
    return {
        accountSetup: { status: 'COMPLETE', blockingIssues: [] },
        operationalConfiguration: { status: 'READY', blockingIssues: [], machineCount: 3, capabilityCount: 5, materialCount: 10 }
    };
};

const TEST_TENANT = 'ph191h-smoke-tenant';
const TEST_SITE = 'site-191h-main';

async function runTests() {
    console.log('=== Starting Phase 191H Review & Controlled Activation Smoke Tests ===\n');

    let reviewId = null;

    // 1. Submit for Review
    {
        const review = await reviewService.submitForReview(TEST_TENANT, TEST_SITE, { role: 'PRINTHOUSE_ADMIN' });
        assert.ok(review.id.startsWith('mprev_'));
        assert.strictEqual(review.status, 'READY_FOR_REVIEW');
        assert.ok(review.snapshot);
        assert.ok(review.snapshot.snapshotHash);
        reviewId = review.id;
        console.log('✓ Submitted onboarding setup for review with immutable evidence snapshot');
    }

    // 2. Prevent Duplicate Active Submission
    {
        let duplicateBlocked = false;
        try {
            await reviewService.submitForReview(TEST_TENANT, TEST_SITE);
        } catch (e) {
            duplicateBlocked = true;
            assert.strictEqual(e.code, 'REVIEW_ALREADY_SUBMITTED');
        }
        assert.strictEqual(duplicateBlocked, true);
        console.log('✓ Duplicate active review submission blocked');
    }

    // 3. Start Review
    {
        const updated = await reviewService.startReview(reviewId, { id: 'admin-1', role: 'SUPER_ADMIN' });
        assert.strictEqual(updated.status, 'UNDER_REVIEW');
        console.log('✓ Admin started review (READY_FOR_REVIEW -> UNDER_REVIEW)');
    }

    // 4. Request Changes
    {
        const updated = await reviewService.requestChanges(reviewId, 'CAPABILITY_REVIEW_REQUIRED', 'Please verify white ink machine calibration', { id: 'admin-1' });
        assert.strictEqual(updated.status, 'CHANGES_REQUESTED');
        assert.strictEqual(updated.reasonCode, 'CAPABILITY_REVIEW_REQUIRED');
        console.log('✓ Admin requested changes with reason code & explanation');
    }

    // 5. Admin Approve Review (Produces MARKETPLACE_APPROVED, but NOT active routing)
    {
        await db.query('UPDATE PRINTHOUSE_MARKETPLACE_REVIEWS SET STATUS = "UNDER_REVIEW" WHERE ID = ?', [reviewId]);
        const approved = await reviewService.approveReview(reviewId, { id: 'admin-1', role: 'SUPER_ADMIN' });
        assert.strictEqual(approved.status, 'APPROVED');

        const initialActivation = await activationService.getActivationStatus(TEST_TENANT);
        assert.strictEqual(initialActivation.jobRoutingAllowed, false);
        assert.strictEqual(initialActivation.marketplaceVisible, false);
        console.log('✓ Admin approved review (MARKETPLACE_APPROVED: true, Production Routing: DISABLED)');
    }

    // 6. Execute Controlled Atomic Activation
    {
        const grant = await activationService.activateMarketplaceNode(reviewId, { id: 'admin-1', role: 'SUPER_ADMIN' });
        assert.ok(grant.id.startsWith('actgrant_'));
        assert.strictEqual(grant.status, 'ACTIVE');
        assert.strictEqual(grant.marketplaceVisible, true);
        assert.strictEqual(grant.liveQuotingAllowed, true);
        assert.strictEqual(grant.jobRoutingAllowed, true);
        assert.strictEqual(grant.productionDispatchAllowed, true);

        const currentActivation = await activationService.getActivationStatus(TEST_TENANT);
        assert.strictEqual(currentActivation.jobRoutingAllowed, true);
        console.log('✓ Controlled atomic activation executed (Capability grants: ACTIVE)');
    }

    // 7. Execute Governed Suspension
    {
        const susp = await activationService.suspendActivation(TEST_TENANT, 'COMPLIANCE_SUSPENSION', { id: 'admin-1' });
        assert.strictEqual(susp.status, 'SUSPENDED');

        const postSuspActivation = await activationService.getActivationStatus(TEST_TENANT);
        assert.strictEqual(postSuspActivation.status, 'SUSPENDED');
        assert.strictEqual(postSuspActivation.jobRoutingAllowed, false);
        console.log('✓ Governed suspension executed cleanly (Job Routing: DISABLED)');
    }

    console.log('\nAll Phase 191H Review & Controlled Activation Smoke Tests Passed Successfully!');
}

runTests()
    .catch((err) => {
        console.error('Smoke tests failed:', err);
        process.exit(1);
    });
