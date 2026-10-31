/**
 * scripts/test-phase38-work-order-execution-integration.js
 * 
 * Mock integration tests for Phase 38.6 Production Start / Work Order Execution Gate.
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
    if (sql.includes('SELECT id, status FROM print_node_machine_profiles WHERE id = ?')) {
        const machineId = params[0];
        if (machineId === 'machine_active') {
            return [{ id: 'machine_active', status: 'ACTIVE' }];
        }
        if (machineId === 'machine_inactive') {
            return [{ id: 'machine_inactive', status: 'INACTIVE' }];
        }
        return [];
    }
    if (sql.includes('UPDATE marketplace_orders')) {
        const orderId = params[1];
        const order = mockOrders.find(o => o.order_id === orderId);
        if (order) {
            order.metadata_json = params[0];
            let status = 'UNKNOWN';
            if (sql.includes('status = "WORK_ORDER_CREATED"')) status = 'WORK_ORDER_CREATED';
            else if (sql.includes('status = "PRODUCTION_STARTED"')) status = 'PRODUCTION_STARTED';
            else if (sql.includes('status = "PRODUCTION_PAUSED"')) status = 'PRODUCTION_PAUSED';
            else if (sql.includes('status = "PRODUCTION_CANCELLED"')) status = 'PRODUCTION_CANCELLED';
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

process.env.PPOS_ENABLE_PHASE38_WORK_ORDER_EXECUTION = 'true';

const workOrderService = require('../src/api/services/marketplaceProductionWorkOrderService');

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
                machineId: 'machine_active',
                assignmentStatus: 'ASSIGNED'
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
    console.log('Running Phase 38.6 Mock Integration Tests...\n');

    try {
        // Test 1: evaluateWorkOrderEligibility - Eligible
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', 'MACHINE_ASSIGNED'));
        // Add PRINTHOUSE_FILE_DOWNLOAD_COMPLETED to eventLog to avoid warning
        eventLog.push({ orderId: 'ord_1', event: { type: 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED' } });

        let res = await workOrderService.evaluateWorkOrderEligibility('ord_1');
        assert.equal(res.ok, true);
        assert.equal(res.eligible, true);
        assert.equal(res.blockers.length, 0);
        assert.equal(res.warnings.length, 0);
        console.log('✅ Test 1: evaluateWorkOrderEligibility (Eligible, no warnings)');

        // Test 2: evaluateWorkOrderEligibility - Warnings
        resetMocks();
        // missing download event, inactive machine
        mockOrders.push(buildMockOrder('ord_1', 'MACHINE_ASSIGNED', {
            production_queue: {
                status: 'MACHINE_ASSIGNED',
                machineAssignment: {
                    machineId: 'machine_inactive',
                    assignmentStatus: 'ASSIGNED'
                }
            }
        }));
        res = await workOrderService.evaluateWorkOrderEligibility('ord_1');
        assert.equal(res.eligible, true);
        assert.ok(res.warnings.includes('FILE_ACCESS_NOT_VERIFIED_BY_AUDIT'));
        assert.ok(res.warnings.includes('MACHINE_REGISTRY_NOT_VERIFIED'));
        console.log('✅ Test 2: evaluateWorkOrderEligibility (Eligible, with warnings)');

        // Test 3: evaluateWorkOrderEligibility - Blocker: status not allowed
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', 'HANDOFF_READY'));
        res = await workOrderService.evaluateWorkOrderEligibility('ord_1');
        assert.equal(res.eligible, false);
        assert.ok(res.blockers.includes('INVALID_ORDER_STATUS_FOR_WORK_ORDER'));
        console.log('✅ Test 3: evaluateWorkOrderEligibility (Blocker: invalid status)');

        // Test 4: evaluateWorkOrderEligibility - Blocker: payment/invoice/unlock/decision missing
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', 'MACHINE_ASSIGNED', {
            dispatch_package: {
                status: 'PRINTHOUSE_ACCEPTED',
                manifest: {
                    invoice: { status: 'DRAFT' },
                    payment: { status: 'PENDING' }
                }
            },
            production_unlock: { status: 'PENDING' },
            production_decision: { decision: 'PENDING' }
        }));
        res = await workOrderService.evaluateWorkOrderEligibility('ord_1');
        assert.equal(res.eligible, false);
        assert.ok(res.blockers.includes('INVOICE_NOT_ISSUED'));
        assert.ok(res.blockers.includes('PAYMENT_NOT_CONFIRMED'));
        assert.ok(res.blockers.includes('PRODUCTION_NOT_UNLOCKED'));
        assert.ok(res.blockers.includes('PRODUCTION_DECISION_NOT_ACCEPTED'));
        console.log('✅ Test 4: evaluateWorkOrderEligibility (Blocker: financial/unlock requirements)');

        // Test 5: createProductionWorkOrder - Success & Event
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', 'MACHINE_ASSIGNED'));
        eventLog.push({ orderId: 'ord_1', event: { type: 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED' } });
        res = await workOrderService.createProductionWorkOrder('ord_1', {}, { operatorId: 'op_123' });
        assert.equal(res.ok, true);
        assert.equal(res.status, 'WORK_ORDER_CREATED');
        assert.equal(res.productionWorkOrder.status, 'WORK_ORDER_CREATED');
        assert.equal(res.productionWorkOrder.createdBy, 'op_123');
        assert.equal(mockOrders[0].status, 'WORK_ORDER_CREATED');
        assert.ok(eventLog.some(e => e.event.type === 'PRODUCTION_WORK_ORDER_CREATED'));
        console.log('✅ Test 5: createProductionWorkOrder (Success & event emitted)');

        // Test 6: createProductionWorkOrder - Idempotent double create
        res = await workOrderService.createProductionWorkOrder('ord_1', {}, { operatorId: 'op_456' });
        assert.equal(res.ok, true);
        assert.equal(res.idempotent, true);
        assert.equal(res.productionWorkOrder.createdBy, 'op_123'); // first creator preserved
        console.log('✅ Test 6: createProductionWorkOrder (Idempotency check)');

        // Test 7: startProductionWorkOrder - Success
        res = await workOrderService.startProductionWorkOrder('ord_1', { shiftId: 'shift_A', batchReference: 'batch_99' }, { operatorId: 'op_123' });
        assert.equal(res.ok, true);
        assert.equal(res.status, 'PRODUCTION_STARTED');
        assert.equal(res.productionWorkOrder.status, 'PRODUCTION_STARTED');
        assert.equal(res.productionWorkOrder.start.startedBy, 'op_123');
        assert.equal(res.productionWorkOrder.start.shiftId, 'shift_A');
        assert.equal(mockOrders[0].status, 'PRODUCTION_STARTED');
        assert.ok(eventLog.some(e => e.event.type === 'PRODUCTION_WORK_ORDER_STARTED'));
        console.log('✅ Test 7: startProductionWorkOrder (Success)');

        // Test 8: startProductionWorkOrder - Idempotency
        res = await workOrderService.startProductionWorkOrder('ord_1', {}, { operatorId: 'op_456' });
        assert.equal(res.ok, true);
        assert.equal(res.idempotent, true);
        assert.equal(res.productionWorkOrder.start.startedBy, 'op_123');
        console.log('✅ Test 8: startProductionWorkOrder (Idempotency)');

        // Test 9: pauseProductionWorkOrder - Success
        res = await workOrderService.pauseProductionWorkOrder('ord_1', { reason: 'MACHINE_JAM', note: 'red light flashing' }, { operatorId: 'op_123' });
        assert.equal(res.ok, true);
        assert.equal(res.status, 'PRODUCTION_PAUSED');
        assert.equal(res.productionWorkOrder.status, 'PRODUCTION_PAUSED');
        assert.equal(res.productionWorkOrder.pauseHistory.length, 1);
        assert.equal(res.productionWorkOrder.pauseHistory[0].reason, 'MACHINE_JAM');
        assert.equal(mockOrders[0].status, 'PRODUCTION_PAUSED');
        assert.ok(eventLog.some(e => e.event.type === 'PRODUCTION_WORK_ORDER_PAUSED'));
        console.log('✅ Test 9: pauseProductionWorkOrder (Success)');

        // Test 10: resumeProductionWorkOrder - Success
        res = await workOrderService.resumeProductionWorkOrder('ord_1', { note: 'cleared jam' }, { operatorId: 'op_123' });
        assert.equal(res.ok, true);
        assert.equal(res.status, 'PRODUCTION_STARTED');
        assert.equal(res.productionWorkOrder.status, 'PRODUCTION_STARTED');
        assert.equal(res.productionWorkOrder.resumeHistory.length, 1);
        assert.equal(mockOrders[0].status, 'PRODUCTION_STARTED');
        assert.ok(eventLog.some(e => e.event.type === 'PRODUCTION_WORK_ORDER_RESUMED'));
        console.log('✅ Test 10: resumeProductionWorkOrder (Success)');

        // Test 11: cancelProductionWorkOrder - Success & Boundaries
        res = await workOrderService.cancelProductionWorkOrder('ord_1', { reason: 'CUSTOMER_CANCELLED' }, { operatorId: 'op_123' });
        assert.equal(res.ok, true);
        assert.equal(res.status, 'PRODUCTION_CANCELLED');
        assert.equal(res.productionWorkOrder.status, 'PRODUCTION_CANCELLED');
        assert.equal(res.productionWorkOrder.cancel.reason, 'CUSTOMER_CANCELLED');
        assert.equal(res.productionWorkOrder.cancel.commercialImpact, 'NONE');
        assert.equal(res.productionWorkOrder.cancel.refundTriggered, false);
        assert.equal(res.productionWorkOrder.cancel.invoiceCancelled, false);
        assert.equal(mockOrders[0].status, 'PRODUCTION_CANCELLED');
        assert.ok(eventLog.some(e => e.event.type === 'PRODUCTION_WORK_ORDER_CANCELLED'));
        console.log('✅ Test 11: cancelProductionWorkOrder (Success, boundary fields checked)');

        // Test 12: cancelProductionWorkOrder - Idempotent if already cancelled
        res = await workOrderService.cancelProductionWorkOrder('ord_1', { reason: 'ANOTHER_REASON' }, { operatorId: 'op_456' });
        assert.equal(res.ok, true);
        assert.equal(res.idempotent, true);
        assert.equal(res.productionWorkOrder.cancel.reason, 'CUSTOMER_CANCELLED'); // first reason preserved
        console.log('✅ Test 12: cancelProductionWorkOrder (Idempotent if already cancelled)');

        // Test 13: cancelProductionWorkOrder - Idempotent if metadata says cancelled but order status didn't update yet
        resetMocks();
        const baseOrder = buildMockOrder('ord_1', 'MACHINE_ASSIGNED');
        const metadata = JSON.parse(baseOrder.metadata_json);
        metadata.production_work_order = {
            status: 'PRODUCTION_CANCELLED',
            cancel: { reason: 'FIRST_CANCEL' }
        };
        baseOrder.metadata_json = JSON.stringify(metadata);
        baseOrder.status = 'WORK_ORDER_CREATED'; // status mismatch
        mockOrders.push(baseOrder);

        res = await workOrderService.cancelProductionWorkOrder('ord_1', { reason: 'SECOND_CANCEL' }, { operatorId: 'op_123' });
        assert.equal(res.ok, true);
        assert.equal(res.idempotent, true);
        assert.equal(res.productionWorkOrder.cancel.reason, 'FIRST_CANCEL');
        console.log('✅ Test 13: cancelProductionWorkOrder (Idempotent if metadata is cancelled)');

        // Test 14: Mutations are blocked after cancellation
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', 'PRODUCTION_CANCELLED', {
            production_work_order: {
                status: 'PRODUCTION_CANCELLED',
                cancel: { reason: 'CANCELLED' }
            }
        }));

        await assert.rejects(
            workOrderService.createProductionWorkOrder('ord_1', {}),
            /PRODUCTION_WORK_ORDER_CANCELLED/
        );
        await assert.rejects(
            workOrderService.startProductionWorkOrder('ord_1', {}),
            /PRODUCTION_WORK_ORDER_CANCELLED/
        );
        await assert.rejects(
            workOrderService.pauseProductionWorkOrder('ord_1', { reason: 'BLOCKED' }),
            /PRODUCTION_WORK_ORDER_CANCELLED/
        );
        await assert.rejects(
            workOrderService.resumeProductionWorkOrder('ord_1', {}),
            /PRODUCTION_WORK_ORDER_CANCELLED/
        );

        console.log('✅ Test 14: Mutation methods block when work order is cancelled');

        // Test 15: evaluateWorkOrderEligibility returns terminal cancelled context when cancelled
        res = await workOrderService.evaluateWorkOrderEligibility('ord_1');
        assert.equal(res.ok, true);
        assert.equal(res.eligible, false);
        assert.ok(res.blockers.includes('PRODUCTION_WORK_ORDER_CANCELLED'));
        assert.equal(res.metadata.isCancelled, true);
        console.log('✅ Test 15: evaluateWorkOrderEligibility returns terminal cancelled context when cancelled');

        console.log('\nAll 15 mock integration tests passed successfully! 🎉');
    } catch (err) {
        console.error('❌ Integration Test failed:', err);
        process.exit(1);
    }
}

runTests();
