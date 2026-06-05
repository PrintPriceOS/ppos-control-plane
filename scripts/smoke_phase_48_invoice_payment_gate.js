const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const marketplaceOrderService = require('../src/api/services/marketplaceOrderService');
const invoicePaymentService = require('../src/api/services/marketplaceInvoicePaymentService');
const productionUnlockService = require('../src/api/services/marketplaceProductionUnlockService');
const productionQueueService = require('../src/api/services/marketplaceProductionQueueService');

async function runTests() {
    console.log(`--- PHASE 48 SMOKE TESTS START ---`);

    // Override process.env.PPOS_ENABLE_PHASE37_PAYMENT
    process.env.PPOS_ENABLE_PHASE37_PAYMENT = 'true';

    // Mock DB queries for isolated tests
    const originalQuery = db.query;

    let mockOrders = [];
    let mockBindings = [];
    let mockFiles = [];
    let mockSnapshotRes = { ok: true, snapshot_id: 'hrs_mock' };
    let mockDecisionRes = { ok: true, decision: { decision: 'APPROVED_WITH_WARNINGS', snapshot_id: 'hrs_mock', report_outcome: 'FIXED_REVIEW_REQUIRED' } };

    db.query = async (sql, params) => {
        if (sql.includes('SELECT * FROM marketplace_orders WHERE order_id = ?')) {
            const order = mockOrders.find(o => o.order_id === params[0]);
            return order ? [order] : [];
        }
        if (sql.includes('FROM marketplace_orders') && sql.includes('SELECT') && sql.includes('o.order_id')) {
            const order = mockOrders.find(o => o.order_id === params[0]);
            if (!order) return [];
            return [{
                id: order.order_id,
                status: order.status,
                selectedOfferId: order.selectedOfferId,
                customerId: order.customerId,
                metadata: JSON.parse(order.metadata_json),
                productionFiles: mockFiles.filter(f => f.order_id === order.order_id).map(f => ({
                    fileId: f.file_id,
                    kind: f.role,
                    status: f.status,
                    preflightStatus: f.preflight_status,
                    preflightOutcomeCategory: f.preflight_outcome_category
                })),
                preflightBindings: mockBindings.filter(b => b.order_id === order.order_id).map(b => ({
                    fileId: b.file_id,
                    preflightJobId: b.preflight_job_id,
                    kind: b.role,
                    status: b.status,
                    outcomeCategory: b.outcome_category
                }))
            }];
        }
        if (sql.includes('SELECT * FROM marketplace_order_preflight_bindings')) {
            return mockBindings.filter(b => b.order_id === params[0]);
        }
        if (sql.includes('SELECT * FROM marketplace_order_files')) {
            return mockFiles.filter(f => f.order_id === params[0] && f.status !== 'SUPERSEDED');
        }
        if (sql.includes('UPDATE marketplace_orders')) {
            return { affectedRows: 1 };
        }
        if (sql.includes('INSERT INTO marketplace_order_events')) {
            return { insertId: 1 };
        }
        if (sql.includes('SELECT status, metadata_json FROM marketplace_orders')) {
            const order = mockOrders.find(o => o.order_id === params[0]);
            return order ? [order] : [];
        }
        if (sql.includes('SELECT type FROM marketplace_order_events')) {
            return [{ type: 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED' }]; // Mock file access
        }
        if (sql.includes('SELECT')) {
            return [];
        }
        return { affectedRows: 1, insertId: 1 };
    };

    // Mock external services to computeReadiness
    const humanReportSnapshotService = require('../src/api/services/preflightHumanReportSnapshotService');
    const reviewApprovalService = require('../src/api/services/preflightReviewApprovalService');
    
    humanReportSnapshotService.getLatestSnapshot = async () => mockSnapshotRes;
    reviewApprovalService.getLatestDecision = async () => mockDecisionRes;

    const setupMockOrder = (orderId, outcome, decision, snapshotId = 'hrs_mock', reportOutcome = 'FIXED_REVIEW_REQUIRED') => {
        const report_json = JSON.stringify({ report: { outcome, severity: 'warning' } });
        mockSnapshotRes = { ok: true, snapshot_id: snapshotId, report_json };
        if (decision) {
            mockDecisionRes = { ok: true, decision: { decision, snapshot_id: 'hrs_mock', report_outcome: reportOutcome } };
        } else {
            mockDecisionRes = { ok: false };
        }

        mockOrders = [{
            order_id: orderId,
            status: 'FILES_UPLOADED',
            selected_offer_id: 'offer_test',
            customer_id: 'cust_test',
            metadata_json: JSON.stringify({
                dispatch_package: { status: 'PRINTHOUSE_ACCEPTED', manifest: {} }
            })
        }];
        mockBindings = [{
            order_id: orderId,
            file_id: 'file1',
            preflight_job_id: 'fix_1',
            role: 'INTERIOR_PDF',
            status: 'COMPLETED_WITH_FINDINGS',
            outcome_category: 'WARNING'
        }];
        mockFiles = [{
            order_id: orderId,
            file_id: 'file1',
            role: 'INTERIOR_PDF',
            status: 'UPLOADED',
            preflight_job_id: 'fix_1',
            preflight_status: 'COMPLETED_WITH_FINDINGS',
            preflight_outcome_category: 'WARNING'
        }, {
            order_id: orderId,
            file_id: 'file2',
            role: 'COVER_PDF',
            status: 'UPLOADED',
            preflight_job_id: 'fix_1',
            preflight_status: 'COMPLETED',
            preflight_outcome_category: 'CERTIFIABLE'
        }];
        
    };

    try {
        console.log(`1. Testing Invoice Blocked on Rejected Review...`);
        setupMockOrder('ord_1', 'FIXED_REVIEW_REQUIRED', 'REJECTED_REQUIRES_REUPLOAD');
        try {
            await invoicePaymentService.generateMarketplaceInvoice('ord_1');
            assert.fail('Should have thrown');
        } catch (err) {
            assert.strictEqual(err.code, 'MARKETPLACE_READINESS_REQUIRED');
            assert.strictEqual(err.statusCode, 409);
            if (!err.readiness.blockers.some(b => b.includes('PREFLIGHT_REVIEW_REJECTED'))) {
                console.log(err.readiness);
                assert.fail('Missing PREFLIGHT_REVIEW_REJECTED');
            }
        }

        console.log(`2. Testing Invoice Blocked on Approval Required (No Decision)...`);
        setupMockOrder('ord_2', 'FIXED_REVIEW_REQUIRED', null);
        try {
            await invoicePaymentService.generateMarketplaceInvoice('ord_2');
            assert.fail('Should have thrown');
        } catch (err) {
            assert.strictEqual(err.code, 'MARKETPLACE_READINESS_REQUIRED');
            assert.strictEqual(err.statusCode, 409);
            assert.ok(err.readiness.blockers.some(b => b.includes('PREFLIGHT_REVIEW_APPROVAL_REQUIRED')));
        }

        console.log(`3. Testing Invoice Allowed with Warnings...`);
        setupMockOrder('ord_3', 'FIXED_REVIEW_REQUIRED', 'APPROVED_WITH_WARNINGS');
        // Override mockOrder to pass all previous invoice gate rules:
        mockOrders[0].metadata_json = JSON.stringify({});
        mockOrders[0].estimated_price = 100;
        mockOrders[0].currency = 'USD';
        
        const res3 = await invoicePaymentService.generateMarketplaceInvoice('ord_3');
        assert.strictEqual(res3.ok, true);
        assert.ok(res3.invoice.warnings.some(w => w.includes('PREFLIGHT_APPROVED_WITH_WARNINGS')));

        console.log(`4. Testing Payment Session Blocked if Readiness False...`);
        setupMockOrder('ord_4', 'FIXED_REVIEW_REQUIRED', 'REJECTED_REQUIRES_REUPLOAD');
        // Let's pretend it somehow got invoiced before, but now readiness fails
        mockOrders[0].metadata_json = JSON.stringify({ invoice: { status: 'ISSUED', amount: 100 } });
        
        try {
            await invoicePaymentService.requestMarketplacePaymentLink('ord_4');
            assert.fail('Should have thrown');
        } catch (err) {
            assert.strictEqual(err.code, 'MARKETPLACE_READINESS_REQUIRED');
            assert.strictEqual(err.statusCode, 409);
            assert.ok(err.readiness.blockers.some(b => b.includes('PREFLIGHT_REVIEW_REJECTED')));
        }

        console.log(`5. Testing Payment Session Allowed with Warnings...`);
        setupMockOrder('ord_5', 'FIXED_REVIEW_REQUIRED', 'APPROVED_WITH_WARNINGS');
        mockOrders[0].metadata_json = JSON.stringify({ invoice: { status: 'ISSUED', amount: 100, invoice_number: 'INV1' } });
        mockOrders[0].estimated_price = 100;
        
        const res5 = await invoicePaymentService.requestMarketplacePaymentLink('ord_5');
        assert.strictEqual(res5.ok, true);
        assert.ok(res5.payment.warnings.some(w => w.includes('PREFLIGHT_APPROVED_WITH_WARNINGS')));

        console.log(`6. Testing Production Unlock Blocked if Readiness Becomes Rejected...`);
        setupMockOrder('ord_6', 'FIXED_REVIEW_REQUIRED', 'REJECTED_REQUIRES_REUPLOAD');
        mockOrders[0].metadata_json = JSON.stringify({
            invoice: { status: 'ISSUED' },
            payment: { status: 'PAYMENT_CONFIRMED' }
        });
        
        try {
            await productionUnlockService.unlockProductionAfterPayment('ord_6');
            assert.fail('Should have thrown');
        } catch (err) {
            assert.strictEqual(err.code, 'MARKETPLACE_READINESS_REQUIRED');
            assert.strictEqual(err.statusCode, 409);
            assert.ok(err.readiness.blockers.some(b => b.includes('PREFLIGHT_REVIEW_REJECTED')));
        }

        console.log(`7. Testing Production Queue Eligibility Blocked if Human Report Rejected...`);
        setupMockOrder('ord_7', 'FIXED_REVIEW_REQUIRED', 'REJECTED_REQUIRES_REUPLOAD');
        mockOrders[0].status = 'PRODUCTION_ACCEPTED';
        mockOrders[0].metadata_json = JSON.stringify({
            dispatch_package: { status: 'PRINTHOUSE_ACCEPTED', manifest: {
                invoice: { status: 'ISSUED' },
                payment: { status: 'PAYMENT_CONFIRMED' }
            }},
            production_unlock: { status: 'PRODUCTION_UNLOCKED' },
            production_decision: { decision: 'PRODUCTION_ACCEPTED' }
        });

        const res7 = await productionQueueService.evaluateProductionQueueEligibility('ord_7');
        assert.strictEqual(res7.eligible, false);
        assert.ok(res7.blockers.some(b => b.includes('PREFLIGHT_REVIEW_REJECTED')));

        console.log(`8. Testing Snapshot Mismatch Same Outcome...`);
        setupMockOrder('ord_8', 'FIXED_REVIEW_REQUIRED', 'APPROVED_WITH_WARNINGS', 'hrs_new_eval', 'FIXED_REVIEW_REQUIRED');
        mockOrders[0].metadata_json = JSON.stringify({});
        mockOrders[0].estimated_price = 100;
        const res8 = await invoicePaymentService.generateMarketplaceInvoice('ord_8');
        assert.strictEqual(res8.ok, true);
        assert.ok(res8.invoice.warnings.some(w => w.includes('PREFLIGHT_REVIEW_DECISION_SNAPSHOT_MISMATCH')));

        console.log(`9. Testing Snapshot Mismatch Conflict...`);
        // The original decision was for BLOCKED, but the current outcome is FIXED_REVIEW_REQUIRED
        setupMockOrder('ord_9', 'FIXED_REVIEW_REQUIRED', 'APPROVED_WITH_WARNINGS', 'hrs_new_eval', 'BLOCKED');
        mockOrders[0].metadata_json = JSON.stringify({});
        mockOrders[0].estimated_price = 100;
        try {
            await invoicePaymentService.generateMarketplaceInvoice('ord_9');
            assert.fail('Should have thrown');
        } catch (err) {
            assert.strictEqual(err.code, 'MARKETPLACE_READINESS_REQUIRED');
            assert.strictEqual(err.statusCode, 409);
            assert.ok(err.readiness.blockers.some(b => b.includes('PREFLIGHT_REVIEW_DECISION_SNAPSHOT_CONFLICT')));
        }

        console.log(`--- ALL SMOKE TESTS PASSED ---`);
    } catch (err) {
        console.error('Smoke Test Failed:', err);
        process.exit(1);
    } finally {
        db.query = originalQuery;
    }
}

runTests();
