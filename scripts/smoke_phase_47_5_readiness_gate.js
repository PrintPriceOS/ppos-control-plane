const db = require('../src/api/services/mysqlClient');
const marketplaceOrderService = require('../src/api/services/marketplaceOrderService');
const humanReportSnapshotService = require('../src/api/services/preflightHumanReportSnapshotService');
const reviewApprovalService = require('../src/api/services/preflightReviewApprovalService');

async function runSmokeTests() {
    console.log('--- PHASE 47.5 SMOKE TESTS START ---');
    
    // Mocking DB, humanReportSnapshotService, and reviewApprovalService
    const originalQuery = db.query;
    const originalGetLatestSnapshot = humanReportSnapshotService.getLatestSnapshot;
    const originalGetLatestDecision = reviewApprovalService.getLatestDecision;

    let mockSnapshot = null;
    let mockDecision = null;

    try {
        humanReportSnapshotService.getLatestSnapshot = async (jobId, ctx) => {
            if (!mockSnapshot) return { ok: false };
            return { ok: true, ...mockSnapshot };
        };

        reviewApprovalService.getLatestDecision = async (jobId, ctx) => {
            if (!mockDecision) return { ok: false };
            return { ok: true, decision: mockDecision };
        };

        const mockOrderId = 'test_order_' + Date.now();
        const mockJobId = 'test_job_' + Date.now();

        // Create a fake order
        db.query = async (sql, params) => {
            if (sql.includes('SELECT * FROM marketplace_orders WHERE order_id = ?')) {
                return [{
                    order_id: mockOrderId,
                    tenant_id: 'ppos-production',
                    status: 'FILES_UPLOADED',
                    selected_offer_id: 'offer_1',
                    customer_id: 'cust_1',
                    readiness_json: '{}'
                }];
            }
            if (sql.includes('SELECT * FROM marketplace_order_files WHERE order_id = ?')) {
                return [{
                    file_id: 'file_1',
                    order_id: mockOrderId,
                    role: 'INTERIOR_PDF',
                    status: 'UPLOADED',
                    preflight_job_id: mockJobId,
                    preflight_status: 'COMPLETED_WITH_FINDINGS'
                }, {
                    file_id: 'file_2',
                    order_id: mockOrderId,
                    role: 'COVER_PDF',
                    status: 'UPLOADED',
                    preflight_job_id: mockJobId + '_c',
                    preflight_status: 'PASS'
                }];
            }
            if (sql.includes('SELECT * FROM marketplace_order_events')) {
                return [];
            }
            if (sql.includes('SELECT * FROM marketplace_order_preflight_bindings')) {
                return [{
                    role: 'INTERIOR_PDF',
                    preflight_job_id: mockJobId,
                    status: 'COMPLETED_WITH_FINDINGS'
                }, {
                    role: 'COVER_PDF',
                    preflight_job_id: mockJobId + '_c',
                    status: 'PASS'
                }];
            }
            // Add a catch all to return empty for UPDATEs
            if (sql.includes('UPDATE marketplace_orders')) {
                return [];
            }
            if (sql.includes('INSERT INTO marketplace_order_events')) {
                return [];
            }
            return originalQuery.call(db, sql, params);
        };

        console.log(`1. Testing FIXED_REVIEW_REQUIRED without decision...`);
        mockSnapshot = {
            snapshot_id: 'snap_1',
            report_json: { report: { outcome: 'FIXED_REVIEW_REQUIRED' } }
        };
        mockDecision = null;
        let readiness = await marketplaceOrderService.computeReadiness(mockOrderId);
        if (readiness.ready !== false) throw new Error('Assertion failed: should not be ready');
        if (!readiness.blockers.includes('PREFLIGHT_REVIEW_APPROVAL_REQUIRED_INTERIOR_PDF')) throw new Error('Assertion failed: missing approval blocker');

        console.log(`2. Testing FIXED_REVIEW_REQUIRED with APPROVED_WITH_WARNINGS...`);
        mockDecision = { decision: 'APPROVED_WITH_WARNINGS', id: 'dec_1', approved_artifact_type: 'review_pdf' };
        readiness = await marketplaceOrderService.computeReadiness(mockOrderId);
        if (readiness.ready !== true) throw new Error('Assertion failed: should be ready');
        if (!readiness.warnings.includes('PREFLIGHT_APPROVED_WITH_WARNINGS_INTERIOR_PDF')) throw new Error('Assertion failed: missing warning');

        console.log(`3. Testing FIXED_REVIEW_REQUIRED with REJECTED_REQUIRES_REUPLOAD...`);
        mockDecision = { decision: 'REJECTED_REQUIRES_REUPLOAD' };
        readiness = await marketplaceOrderService.computeReadiness(mockOrderId);
        if (readiness.ready !== false) throw new Error('Assertion failed: should not be ready');
        if (!readiness.blockers.includes('PREFLIGHT_REVIEW_REJECTED_INTERIOR_PDF')) throw new Error('Assertion failed: missing reject blocker');

        console.log(`4. Testing BLOCKED Human Report...`);
        mockSnapshot = {
            snapshot_id: 'snap_1',
            report_json: { report: { outcome: 'BLOCKED' } }
        };
        readiness = await marketplaceOrderService.computeReadiness(mockOrderId);
        if (readiness.ready !== false) throw new Error('Assertion failed: should not be ready');
        if (!readiness.blockers.includes('PREFLIGHT_BLOCKED_BY_HUMAN_REPORT_INTERIOR_PDF')) throw new Error('Assertion failed: missing blocked by report blocker');

        console.log(`5. Testing PROCESSING Human Report...`);
        mockSnapshot = {
            snapshot_id: 'snap_1',
            report_json: { report: { outcome: 'PROCESSING' } }
        };
        readiness = await marketplaceOrderService.computeReadiness(mockOrderId);
        if (readiness.ready !== false) throw new Error('Assertion failed: should not be ready');
        if (!readiness.blockers.includes('PREFLIGHT_PROCESSING_INTERIOR_PDF')) throw new Error('Assertion failed: missing processing blocker');

        console.log(`6. Testing UNKNOWN Human Report...`);
        mockSnapshot = {
            snapshot_id: 'snap_1',
            report_json: { report: { outcome: 'UNKNOWN' } }
        };
        readiness = await marketplaceOrderService.computeReadiness(mockOrderId);
        if (readiness.ready !== false) throw new Error('Assertion failed: should not be ready');
        if (!readiness.blockers.includes('PREFLIGHT_HUMAN_REPORT_UNKNOWN_INTERIOR_PDF')) throw new Error('Assertion failed: missing unknown blocker');

        console.log(`7. Testing No Snapshot...`);
        mockSnapshot = null;
        readiness = await marketplaceOrderService.computeReadiness(mockOrderId);
        if (readiness.ready !== false) throw new Error('Assertion failed: should not be ready');
        if (!readiness.blockers.includes('PREFLIGHT_HUMAN_REPORT_REQUIRED_INTERIOR_PDF')) throw new Error('Assertion failed: missing required blocker');

        console.log('--- ALL SMOKE TESTS PASSED ---');
    } catch (err) {
        console.error('--- SMOKE TEST FAILED ---');
        console.error(err);
        process.exit(1);
    } finally {
        db.query = originalQuery;
        humanReportSnapshotService.getLatestSnapshot = originalGetLatestSnapshot;
        reviewApprovalService.getLatestDecision = originalGetLatestDecision;
    }
}

runSmokeTests();
