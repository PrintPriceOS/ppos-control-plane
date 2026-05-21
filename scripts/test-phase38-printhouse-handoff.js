/**
 * scripts/test-phase38-printhouse-handoff.js
 * 
 * Mock/static tests for Phase 38.1 Printhouse Handoff Consumption API.
 */

const assert = require('assert');

// Setup Mocks Before Requiring
const mysqlClient = require('../src/api/services/mysqlClient');
const marketplaceOrderService = require('../src/api/services/marketplaceOrderService');

let mockOrders = [];
let queryLog = [];
let eventLog = [];

mysqlClient.query = async (sql, params) => {
    queryLog.push({ sql, params });
    if (sql.includes('SELECT order_id, status, metadata_json') || sql.includes('LIKE \'%"dispatch_package"%\'')) {
        return mockOrders.filter(o => o.metadata_json.includes('dispatch_package'));
    }
    if (sql.includes('SELECT * FROM marketplace_orders') || sql.includes('SELECT metadata_json FROM marketplace_orders')) {
        const orderId = params[0];
        const order = mockOrders.find(o => o.order_id === orderId);
        return order ? [order] : [];
    }
    if (sql.includes('UPDATE marketplace_orders')) {
        const orderId = params[2];
        const order = mockOrders.find(o => o.order_id === orderId);
        if (order) {
            order.metadata_json = params[0];
            order.status = params[1];
        }
        return { affectedRows: 1 };
    }
    return [];
};

marketplaceOrderService.appendOrderEvent = async (orderId, event) => {
    eventLog.push({ orderId, event });
    return { ok: true };
};

marketplaceOrderService.listAuditEvents = async (options) => {
    return { ok: true, events: eventLog.filter(e => e.orderId === options.orderId).map(e => ({ event_type: e.event.type, payload: e.event.payload })) };
};

// Require the service
const handoffService = require('../src/api/services/marketplacePrinthouseHandoffService');

function resetMocks() {
    mockOrders = [];
    queryLog = [];
    eventLog = [];
}

function buildMockOrder(id, dispatchPackage) {
    return {
        order_id: id,
        status: 'PRINTHOUSE_HANDOFF_READY',
        metadata_json: JSON.stringify({
            dispatch_package: dispatchPackage
        })
    };
}

const mockDispatchPackage = {
    packageId: 'dpkg_123',
    status: 'PRINTHOUSE_HANDOFF_READY',
    handoffStatus: 'PRINTHOUSE_HANDOFF_READY',
    manifest: {
        orderId: 'ord_mock_1',
        printhouse: { id: 'ph_1', name: 'Mock Printer' },
        files: [
            { fileId: 'f1', role: 'INTERIOR_PDF', storagePath: '/tmp/fixtures/int.pdf' },
            { fileId: 'f2', role: 'COVER_PDF', storagePath: '/var/www/uploads/cov.pdf' }
        ]
    }
};

async function runTests() {
    console.log('Running Phase 38.1 Printhouse Handoff Tests...\n');

    try {
        // Test 1: list returns only orders with dispatch_package
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', mockDispatchPackage));
        mockOrders.push({ order_id: 'ord_2', status: 'DRAFT', metadata_json: '{}' });
        let res = await handoffService.listPrinthouseHandoffPackages();
        assert.equal(res.count, 1);
        assert.equal(res.packages[0].orderId, 'ord_1');
        console.log('✅ Test 1: list returns only orders with dispatch_package');

        // Test 2: list filters by status
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', mockDispatchPackage));
        mockOrders.push(buildMockOrder('ord_2', { ...mockDispatchPackage, status: 'PRINTHOUSE_ACCEPTED' }));
        res = await handoffService.listPrinthouseHandoffPackages({ status: 'PRINTHOUSE_ACCEPTED' });
        assert.equal(res.count, 1);
        assert.equal(res.packages[0].orderId, 'ord_2');
        console.log('✅ Test 2: list filters by status');

        // Test 3 & 4: get returns sanitized manifest and redacts physical paths
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', mockDispatchPackage));
        res = await handoffService.getPrinthouseHandoffPackage('ord_1');
        assert.equal(res.ok, true);
        assert.equal(res.manifest.files[0].storagePath, '/api/production-files/download/f1');
        assert.equal(res.manifest.files[1].storagePath, '/api/production-files/download/f2');
        console.log('✅ Test 3 & 4: get returns sanitized manifest with redacted paths');

        // Test 5: accept works from PRINTHOUSE_HANDOFF_READY
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', mockDispatchPackage));
        res = await handoffService.acceptPrinthouseHandoff('ord_1', { notes: 'looks good' });
        assert.equal(res.ok, true);
        assert.equal(res.dispatchPackage.status, 'PRINTHOUSE_ACCEPTED');
        assert.equal(mockOrders[0].status, 'PRINTHOUSE_ACCEPTED');
        assert.ok(eventLog.find(e => e.event.type === 'PRINTHOUSE_HANDOFF_ACCEPTED'));
        console.log('✅ Test 5: accept works from PRINTHOUSE_HANDOFF_READY');

        // Test 6: accept is idempotent
        res = await handoffService.acceptPrinthouseHandoff('ord_1', { notes: 'again' });
        assert.equal(res.idempotent, true);
        console.log('✅ Test 6: accept is idempotent');

        // Test 7: reject requires reason
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', mockDispatchPackage));
        res = await handoffService.rejectPrinthouseHandoff('ord_1', {});
        assert.equal(res.ok, false);
        assert.equal(res.error, 'REJECTION_REASON_REQUIRED');
        console.log('✅ Test 7: reject requires reason');

        // Test 8: reject persists PRINTHOUSE_REJECTED
        res = await handoffService.rejectPrinthouseHandoff('ord_1', { reason: 'bad file' });
        assert.equal(res.ok, true);
        assert.equal(res.dispatchPackage.status, 'PRINTHOUSE_REJECTED');
        assert.equal(mockOrders[0].status, 'PRINTHOUSE_REJECTED');
        assert.ok(eventLog.find(e => e.event.type === 'PRINTHOUSE_HANDOFF_REJECTED'));
        console.log('✅ Test 8: reject persists PRINTHOUSE_REJECTED');

        // Test 9: clarification requires message
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', mockDispatchPackage));
        res = await handoffService.requestHandoffClarification('ord_1', {});
        assert.equal(res.ok, false);
        assert.equal(res.error, 'CLARIFICATION_MESSAGE_REQUIRED');
        console.log('✅ Test 9: clarification requires message');

        // Test 10: clarification persists CLARIFICATION_REQUESTED
        res = await handoffService.requestHandoffClarification('ord_1', { message: 'need bleed details' });
        assert.equal(res.ok, true);
        assert.equal(res.dispatchPackage.status, 'CLARIFICATION_REQUESTED');
        assert.equal(mockOrders[0].status, 'HANDOFF_CLARIFICATION_REQUESTED');
        assert.ok(eventLog.find(e => e.event.type === 'PRINTHOUSE_HANDOFF_CLARIFICATION_REQUESTED'));
        console.log('✅ Test 10: clarification persists CLARIFICATION_REQUESTED');

        // Test 11: timeline returns handoff events
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', mockDispatchPackage));
        await marketplaceOrderService.appendOrderEvent('ord_1', { type: 'DISPATCH_PACKAGE_CREATED', payload: {} });
        await marketplaceOrderService.appendOrderEvent('ord_1', { type: 'PRINTHOUSE_HANDOFF_READY', payload: {} });
        await marketplaceOrderService.appendOrderEvent('ord_1', { type: 'SOME_OTHER_EVENT', payload: {} });
        res = await handoffService.getPrinthouseHandoffTimeline('ord_1');
        assert.equal(res.timeline.length, 2);
        assert.ok(res.timeline.find(e => e.event_type === 'DISPATCH_PACKAGE_CREATED'));
        console.log('✅ Test 11: timeline returns only handoff events');

        // Test 12: missing package returns HANDOFF_PACKAGE_NOT_FOUND
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', null));
        res = await handoffService.getPrinthouseHandoffPackage('ord_1');
        assert.equal(res.ok, false);
        assert.equal(res.error, 'HANDOFF_PACKAGE_NOT_FOUND');
        console.log('✅ Test 12: missing package returns HANDOFF_PACKAGE_NOT_FOUND');

        // Test 13: timeline falls back to synthetic events
        resetMocks();
        mockOrders.push(buildMockOrder('ord_1', {
            ...mockDispatchPackage,
            createdAt: '2026-05-21T10:00:00.000Z',
            status: 'PRINTHOUSE_HANDOFF_READY'
        }));
        res = await handoffService.getPrinthouseHandoffTimeline('ord_1');
        assert.equal(res.timeline.length, 2); // DISPATCH_PACKAGE_CREATED and PRINTHOUSE_HANDOFF_READY
        assert.equal(res.timeline[0].source, 'metadata_fallback');
        console.log('✅ Test 13: timeline falls back to synthetic events');

        console.log('\nAll mock tests passed successfully.');
    } catch (err) {
        console.error('❌ Test failed:', err);
        process.exit(1);
    }
}

runTests();
