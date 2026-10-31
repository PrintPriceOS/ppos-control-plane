/**
 * scripts/test-phase38-production-progress-integration.js
 * 
 * Mock database integration tests for Phase 38.7 Production Progress.
 */

const assert = require('assert');

// Setup Mocks before requiring services
const mysqlClient = require('../src/api/services/mysqlClient');
const marketplaceOrderService = require('../src/api/services/marketplaceOrderService');

let mockOrders = [];
let queryLog = [];
let eventLog = [];

mysqlClient.query = async (sql, params) => {
    queryLog.push({ sql, params });
    if (sql.includes('SELECT status, metadata_json FROM marketplace_orders')) {
        const orderId = params[0];
        const order = mockOrders.find(o => o.order_id === orderId);
        return order ? [order] : [];
    }
    if (sql.includes('SELECT type FROM marketplace_order_events WHERE order_id = ? AND type = "PRINTHOUSE_FILE_DOWNLOAD_COMPLETED"')) {
        const hasCompleted = eventLog.some(e => e.orderId === params[0] && e.event.type === 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED');
        return hasCompleted ? [{ type: 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED' }] : [];
    }
    if (sql.includes('UPDATE marketplace_orders')) {
        const orderId = params[1];
        const order = mockOrders.find(o => o.order_id === orderId);
        if (order) {
            order.metadata_json = params[0];
            let status = 'UNKNOWN';
            if (sql.includes('status = "PRODUCTION_IN_PROGRESS"')) status = 'PRODUCTION_IN_PROGRESS';
            else if (sql.includes('status = "PRODUCTION_PAUSED"')) status = 'PRODUCTION_PAUSED';
            else if (sql.includes('status = "PRODUCTION_COMPLETION_READY"')) status = 'PRODUCTION_COMPLETION_READY';
            order.status = status;
        }
        return { affectedRows: 1 };
    }
    return [];
};

marketplaceOrderService.appendOrderEvent = async (orderId, event) => {
    eventLog.push({ orderId, event });
    return { ok: true };
};

process.env.PPOS_ENABLE_PHASE38_PRODUCTION_PROGRESS = 'true';

const progressService = require('../src/api/services/marketplaceProductionProgressService');

function resetMocks() {
    mockOrders = [];
    queryLog = [];
    eventLog = [];
}

function buildMockOrder(id, status, metadataExtra = {}) {
    const baseMetadata = {
        dispatch_package: {
            status: 'PRINTHOUSE_ACCEPTED',
            manifest: {
                invoice: { status: 'ISSUED' },
                payment: { status: 'PAYMENT_CONFIRMED' }
            }
        },
        production_unlock: { status: 'PRODUCTION_UNLOCKED' },
        production_decision: { decision: 'PRODUCTION_ACCEPTED' },
        production_queue: {
            status: 'MACHINE_ASSIGNED',
            machineAssignment: {
                machineId: 'machine_smoke_001',
                assignmentStatus: 'ASSIGNED'
            }
        },
        production_work_order: {
            phase: '38.6',
            workOrderId: 'wo_smoke_001',
            machineId: 'machine_smoke_001',
            status: 'PRODUCTION_STARTED',
            start: {
                startedAt: new Date().toISOString()
            }
        },
        ...metadataExtra
    };
    return {
        order_id: id,
        status: status,
        metadata_json: JSON.stringify(baseMetadata)
    };
}

async function runTests() {
    console.log('Running Phase 38.7 Mock Database Integration Tests...\n');

    try {
        // Test 1: evaluateProductionProgressEligibility - Eligible (no warnings)
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', 'PRODUCTION_STARTED'));
        eventLog.push({ orderId: 'ord_1', event: { type: 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED' } });

        let res = await progressService.evaluateProductionProgressEligibility('ord_1');
        assert.equal(res.ok, true);
        assert.equal(res.eligible, true);
        assert.equal(res.blockers.length, 0);
        assert.equal(res.warnings.length, 0);
        console.log('✅ Test 1: evaluateProductionProgressEligibility (Eligible, no warnings)');

        // Test 2: evaluateProductionProgressEligibility - Warnings
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', 'PRODUCTION_STARTED')); // No file download event in eventLog
        res = await progressService.evaluateProductionProgressEligibility('ord_1');
        assert.equal(res.eligible, true);
        assert.ok(res.warnings.includes('FILE_ACCESS_NOT_VERIFIED_BY_AUDIT'));
        console.log('✅ Test 2: evaluateProductionProgressEligibility (Eligible, warnings present)');

        // Test 3: evaluateProductionProgressEligibility - Blockers (invoice, payment, unlock, queue)
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', 'PRODUCTION_STARTED', {
            dispatch_package: {
                status: 'PRINTHOUSE_ACCEPTED',
                manifest: {
                    invoice: { status: 'DRAFT' },
                    payment: { status: 'PENDING' }
                }
            },
            production_unlock: { status: 'PENDING' },
            production_decision: { decision: 'PENDING' },
            production_queue: { status: 'PENDING' },
            production_work_order: null
        }));
        res = await progressService.evaluateProductionProgressEligibility('ord_1');
        assert.equal(res.eligible, false);
        assert.ok(res.blockers.includes('INVOICE_NOT_ISSUED'));
        assert.ok(res.blockers.includes('PAYMENT_NOT_CONFIRMED'));
        assert.ok(res.blockers.includes('PRODUCTION_NOT_UNLOCKED'));
        assert.ok(res.blockers.includes('PRODUCTION_DECISION_NOT_ACCEPTED'));
        assert.ok(res.blockers.includes('PRODUCTION_QUEUE_NOT_ASSIGNED'));
        assert.ok(res.blockers.includes('PRODUCTION_WORK_ORDER_MISSING'));
        console.log('✅ Test 3: evaluateProductionProgressEligibility (Blockers caught)');

        // Test 4: recordProductionProgress - Success
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', 'PRODUCTION_STARTED'));
        eventLog.push({ orderId: 'ord_1', event: { type: 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED' } });
        
        res = await progressService.recordProductionProgress('ord_1', {
            progressPercent: 30,
            milestone: 'PRINTING_STARTED',
            note: 'First pass started'
        }, { operatorId: 'op_1' });

        assert.equal(res.ok, true);
        assert.equal(res.status, 'PRODUCTION_IN_PROGRESS');
        assert.equal(res.productionProgress.progressPercent, 30);
        assert.equal(res.productionProgress.lastMilestone, 'PRINTING_STARTED');
        assert.equal(res.productionProgress.milestones.length, 1);
        assert.equal(mockOrders[0].status, 'PRODUCTION_IN_PROGRESS');
        assert.ok(eventLog.some(e => e.event.type === 'PRODUCTION_PROGRESS_RECORDED'));
        console.log('✅ Test 4: recordProductionProgress (Success recording milestone)');

        // Test 5: recordProductionProgress - Idempotency
        res = await progressService.recordProductionProgress('ord_1', {
            progressPercent: 30,
            milestone: 'PRINTING_STARTED',
            note: 'First pass started'
        }, { operatorId: 'op_1' });
        assert.equal(res.ok, true);
        assert.equal(res.idempotent, true);
        assert.equal(res.productionProgress.milestones.length, 1);
        console.log('✅ Test 5: recordProductionProgress (Idempotency verified)');

        // Test 6: recordProductionProgress - Regression block / forceRegression
        await assert.rejects(
            progressService.recordProductionProgress('ord_1', {
                progressPercent: 20,
                milestone: 'PLATES_PREPARED',
                note: 'Accidental regression test'
            }),
            /PROGRESS_REGRESSION_BLOCKED/
        );

        res = await progressService.recordProductionProgress('ord_1', {
            progressPercent: 20,
            milestone: 'PLATES_PREPARED',
            note: 'Forced regression',
            forceRegression: true,
            reason: 'Plates damaged'
        }, { operatorId: 'op_1' });

        assert.equal(res.ok, true);
        assert.equal(res.productionProgress.progressPercent, 20);
        assert.ok(res.productionProgress.warnings.includes('PROGRESS_REGRESSION_FORCED'));
        console.log('✅ Test 6: recordProductionProgress (Regression validation & force option)');

        // Test 7: recordProductionProgress - Out of range percentages
        await assert.rejects(
            progressService.recordProductionProgress('ord_1', {
                progressPercent: 100,
                milestone: 'PRINTING_COMPLETED'
            }),
            /INVALID_PROGRESS_PERCENT/
        );
        await assert.rejects(
            progressService.recordProductionProgress('ord_1', {
                progressPercent: -5,
                milestone: 'PRESS_SETUP'
            }),
            /INVALID_PROGRESS_PERCENT/
        );
        console.log('✅ Test 7: recordProductionProgress (Range bounds restricted to 0-99)');

        // Test 8: pauseProductionProgress - Success
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', 'PRODUCTION_STARTED'));
        eventLog.push({ orderId: 'ord_1', event: { type: 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED' } });

        res = await progressService.pauseProductionProgress('ord_1', {
            reason: 'WAITING_FOR_PAPER',
            note: 'Out of stock'
        }, { operatorId: 'op_1' });

        assert.equal(res.ok, true);
        assert.equal(res.status, 'PRODUCTION_PAUSED');
        assert.equal(res.productionProgress.status, 'PRODUCTION_PAUSED');
        assert.equal(res.productionProgress.pauseHistory.length, 1);
        assert.equal(res.productionProgress.pauseHistory[0].reason, 'WAITING_FOR_PAPER');

        // Check synchronization with work order
        const metadata = JSON.parse(mockOrders[0].metadata_json);
        assert.equal(metadata.production_work_order.status, 'PRODUCTION_PAUSED');
        assert.equal(metadata.production_work_order.pauseHistory.length, 1);
        assert.equal(metadata.production_work_order.pauseHistory[0].reason, 'WAITING_FOR_PAPER');
        assert.ok(eventLog.some(e => e.event.type === 'PRODUCTION_PROGRESS_PAUSED'));
        console.log('✅ Test 8: pauseProductionProgress (Success & work order sync)');

        // Test 9: pauseProductionProgress - Idempotency
        res = await progressService.pauseProductionProgress('ord_1', {
            reason: 'WAITING_FOR_PAPER',
            note: 'Out of stock'
        }, { operatorId: 'op_1' });
        assert.equal(res.ok, true);
        assert.equal(res.idempotent, true);
        assert.equal(res.productionProgress.pauseHistory.length, 1);
        console.log('✅ Test 9: pauseProductionProgress (Idempotency verified)');

        // Test 10: resumeProductionProgress - Success
        res = await progressService.resumeProductionProgress('ord_1', {
            note: 'Paper arrived'
        }, { operatorId: 'op_1' });

        assert.equal(res.ok, true);
        assert.equal(res.status, 'PRODUCTION_IN_PROGRESS');
        assert.equal(res.productionProgress.status, 'PRODUCTION_IN_PROGRESS');
        assert.equal(res.productionProgress.resumeHistory.length, 1);

        const metadataAfterResume = JSON.parse(mockOrders[0].metadata_json);
        assert.equal(metadataAfterResume.production_work_order.status, 'PRODUCTION_IN_PROGRESS');
        assert.equal(metadataAfterResume.production_work_order.resumeHistory.length, 1);
        assert.ok(eventLog.some(e => e.event.type === 'PRODUCTION_PROGRESS_RESUMED'));
        console.log('✅ Test 10: resumeProductionProgress (Success & work order sync)');

        // Test 11: resumeProductionProgress - Idempotency
        res = await progressService.resumeProductionProgress('ord_1', {
            note: 'Another note'
        }, { operatorId: 'op_2' });
        assert.equal(res.ok, true);
        assert.equal(res.idempotent, true);
        assert.equal(res.productionProgress.resumeHistory.length, 1);
        console.log('✅ Test 11: resumeProductionProgress (Idempotency verified)');

        // Test 12: markProductionCompletionReady - Progress < 90 Block
        resetMocks();
        // Set mock progress to 85%
        const ordExtra = buildMockOrder('ord_1', 'PRODUCTION_IN_PROGRESS', {
            production_progress: {
                phase: '38.7',
                status: 'PRODUCTION_IN_PROGRESS',
                progressPercent: 85,
                milestones: [{ progressPercent: 85, milestone: 'BINDING_COMPLETED' }],
                pauseHistory: [],
                resumeHistory: []
            }
        });
        mockOrders.push(ordExtra);
        eventLog.push({ orderId: 'ord_1', event: { type: 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED' } });

        await assert.rejects(
            progressService.markProductionCompletionReady('ord_1', { note: 'Done' }),
            /COMPLETION_READY_PROGRESS_PERCENT_REQUIRED/
        );
        console.log('✅ Test 12: markProductionCompletionReady (Blocked below 90% progress)');

        // Test 13: markProductionCompletionReady - Success
        // Update progress to 95% first
        await progressService.recordProductionProgress('ord_1', {
            progressPercent: 95,
            milestone: 'PACKAGING_COMPLETED',
            note: 'All boxed'
        }, { operatorId: 'op_1' });

        res = await progressService.markProductionCompletionReady('ord_1', {
            note: 'All done and ready for completion/QA'
        }, { operatorId: 'op_1' });

        assert.equal(res.ok, true);
        assert.equal(res.status, 'PRODUCTION_COMPLETION_READY');
        assert.equal(res.productionProgress.status, 'PRODUCTION_COMPLETION_READY');
        assert.ok(res.productionProgress.completionReady);
        assert.equal(res.productionProgress.completionReady.completionTriggered, false);
        assert.equal(res.productionProgress.completionReady.shipmentTriggered, false);
        assert.equal(res.productionProgress.completionReady.qaRequired, true);

        const metadataAfterReady = JSON.parse(mockOrders[0].metadata_json);
        assert.equal(metadataAfterReady.production_work_order.status, 'PRODUCTION_COMPLETION_READY');
        assert.ok(eventLog.some(e => e.event.type === 'PRODUCTION_COMPLETION_READY_MARKED'));
        console.log('✅ Test 13: markProductionCompletionReady (Success & metadata attributes)');

        // Test 14: markProductionCompletionReady - Idempotency
        res = await progressService.markProductionCompletionReady('ord_1', {}, { operatorId: 'op_2' });
        assert.equal(res.ok, true);
        assert.equal(res.idempotent, true);
        console.log('✅ Test 14: markProductionCompletionReady (Idempotency verified)');

        // Test 15: Block mutations if cancelled
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', 'PRODUCTION_CANCELLED', {
            production_work_order: {
                status: 'PRODUCTION_CANCELLED',
                cancel: { reason: 'CANCELLED_PWO' }
            }
        }));

        await assert.rejects(
            progressService.recordProductionProgress('ord_1', { progressPercent: 50, milestone: 'PRINTING_STARTED' }),
            /PRODUCTION_CANCELLED/
        );
        await assert.rejects(
            progressService.pauseProductionProgress('ord_1', { reason: 'FAIL' }),
            /PRODUCTION_CANCELLED/
        );

        // Now test if order status is active but work order is cancelled
        resetMocks();
        mockOrders.push(buildMockOrder('ord_2', 'PRODUCTION_STARTED', {
            production_work_order: {
                status: 'PRODUCTION_CANCELLED',
                cancel: { reason: 'CANCELLED_PWO' }
            }
        }));
        eventLog.push({ orderId: 'ord_2', event: { type: 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED' } });

        await assert.rejects(
            progressService.recordProductionProgress('ord_2', { progressPercent: 50, milestone: 'PRINTING_STARTED' }),
            /PRODUCTION_WORK_ORDER_CANCELLED/
        );
        await assert.rejects(
            progressService.pauseProductionProgress('ord_2', { reason: 'FAIL' }),
            /PRODUCTION_WORK_ORDER_CANCELLED/
        );
        await assert.rejects(
            progressService.resumeProductionProgress('ord_2', {}),
            /PRODUCTION_WORK_ORDER_CANCELLED/
        );
        await assert.rejects(
            progressService.markProductionCompletionReady('ord_2', {}),
            /PRODUCTION_WORK_ORDER_CANCELLED/
        );
        console.log('✅ Test 15: Mutations correctly blocked after cancellation (both order and work order levels)');

        console.log('\nAll 15 mock database integration tests passed successfully! 🎉');
    } catch (err) {
        console.error('❌ Mock Integration Test failed:', err);
        process.exit(1);
    }
}

runTests();
