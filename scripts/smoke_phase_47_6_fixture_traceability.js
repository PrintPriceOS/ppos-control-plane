const db = require('../src/api/services/mysqlClient');
const marketplaceOrderService = require('../src/api/services/marketplaceOrderService');
const humanReportSnapshotService = require('../src/api/services/preflightHumanReportSnapshotService');
const reviewApprovalService = require('../src/api/services/preflightReviewApprovalService');

async function runSmokeTests() {
    console.log('--- PHASE 47.6 SMOKE TESTS START ---');
    
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
                    preflight_job_id: mockJobId + '_cover',
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
                    preflight_job_id: mockJobId + '_cover',
                    status: 'PASS'
                }];
            }
            if (sql.includes('UPDATE marketplace_orders')) {
                return [];
            }
            if (sql.includes('INSERT INTO marketplace_order_events')) {
                return [];
            }
            return originalQuery.call(db, sql, params);
        };

        console.log(`1. Testing Snapshot Match...`);
        mockSnapshot = {
            snapshot_id: 'snap_A',
            report_json: { report: { outcome: 'FIXED_REVIEW_REQUIRED' } }
        };
        mockDecision = { decision: 'APPROVED_WITH_WARNINGS', id: 'dec_1', snapshot_id: 'snap_A', report_outcome: 'FIXED_REVIEW_REQUIRED' };
        
        let readiness = await marketplaceOrderService.computeReadiness(mockOrderId);
        let gate = readiness.humanReportGates.find(g => g.file_kind === 'INTERIOR_PDF');
        
        if (readiness.ready !== true) throw new Error('Assertion failed: should be ready. Blockers: ' + JSON.stringify(readiness.blockers));
        if (gate.snapshot_mismatch !== false) throw new Error('Assertion failed: mismatch should be false');
        if (readiness.warnings.includes('PREFLIGHT_REVIEW_DECISION_SNAPSHOT_MISMATCH_INTERIOR_PDF')) throw new Error('Assertion failed: should not have mismatch warning');

        console.log(`2. Testing Snapshot Mismatch Same Outcome...`);
        mockSnapshot.snapshot_id = 'snap_B';
        readiness = await marketplaceOrderService.computeReadiness(mockOrderId);
        gate = readiness.humanReportGates.find(g => g.file_kind === 'INTERIOR_PDF');

        if (readiness.ready !== true) throw new Error('Assertion failed: should be ready despite mismatch');
        if (gate.snapshot_mismatch !== true) throw new Error('Assertion failed: mismatch should be true');
        if (!readiness.warnings.includes('PREFLIGHT_REVIEW_DECISION_SNAPSHOT_MISMATCH_INTERIOR_PDF')) throw new Error('Assertion failed: missing mismatch warning');

        console.log(`3. Testing Snapshot Mismatch Conflicting Outcome...`);
        mockSnapshot.report_json.report.outcome = 'BLOCKED';
        readiness = await marketplaceOrderService.computeReadiness(mockOrderId);
        gate = readiness.humanReportGates.find(g => g.file_kind === 'INTERIOR_PDF');

        if (readiness.ready !== false) throw new Error('Assertion failed: should NOT be ready');
        if (gate.snapshot_mismatch !== true) throw new Error('Assertion failed: mismatch should be true');
        if (!readiness.blockers.includes('PREFLIGHT_REVIEW_DECISION_SNAPSHOT_CONFLICT_INTERIOR_PDF')) throw new Error('Assertion failed: missing conflict blocker');

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
