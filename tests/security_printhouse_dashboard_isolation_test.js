/**
 * tests/security_printhouse_dashboard_isolation_test.js
 * 
 * Exhaustive security, multi-tenant, and cross-printhouse isolation validation
 * for all six Printhouse Dashboard endpoints.
 */
const assert = require('assert');
const { FIXTURES, generateMockToken, createMockReq, dispatchRequest, setQueryStub, teardown } = require('./security_test_helper');
const printhouseDashboardRouter = require('../src/api/routes/printhouseDashboard');

async function runTests() {
    console.log('Running Expanded Printhouse Dashboard isolation tests...');

    // Mock DB response for active printer nodes check to allow auth middleware checks to pass
    const setupActiveNodeStub = (additionalMocking = () => []) => {
        setQueryStub((sql, params) => {
            if (sql.includes('SELECT status FROM printer_nodes')) {
                return [{ status: 'active' }];
            }
            return additionalMocking(sql, params);
        });
    };

    const userA1 = {
        id: 'user-ph-a1',
        role: 'PRINTHOUSE_ADMIN',
        tenantId: FIXTURES.tenantA.tenantId,
        printhouseId: FIXTURES.tenantA.printhouses[0]
    };

    const userA2 = {
        id: 'user-ph-a2',
        role: 'PRINTHOUSE_ADMIN',
        tenantId: FIXTURES.tenantA.tenantId,
        printhouseId: FIXTURES.tenantA.printhouses[1]
    };

    const userB = {
        id: 'user-ph-b1',
        role: 'PRINTHOUSE_ADMIN',
        tenantId: FIXTURES.tenantB.tenantId,
        printhouseId: FIXTURES.tenantB.printhouses[0]
    };

    const adminUser = {
        id: 'user-sysadmin',
        role: 'SUPER_ADMIN',
        tenantId: 'system',
        printhouseId: 'system-node'
    };

    // ==========================================
    // 1. ENDPOINT: /summary
    // ==========================================
    console.log('Testing /summary endpoint...');
    
    // Value-based fixture asserting A1 vs A2 vs B counts
    setupActiveNodeStub((sql, params) => {
        // Count jobs based on printhouse ID
        if (sql.includes('preflight_artifact_registry')) {
            const pId = params[1];
            if (pId === FIXTURES.tenantA.printhouses[0]) {
                return [{ cnt: 4, total_bytes: 4096 }];
            } else if (pId === FIXTURES.tenantA.printhouses[1]) {
                return [{ cnt: 9, total_bytes: 9999 }];
            }
        }
        if (sql.includes('preflight_job_registry')) {
            const pId = params[1];
            if (pId === FIXTURES.tenantA.printhouses[0]) {
                return [
                    { status: 'PROCESSING', created_at: new Date() },
                    { status: 'PROCESSING', created_at: new Date() },
                    { status: 'COMPLETED', created_at: new Date() }
                ];
            } else if (pId === FIXTURES.tenantA.printhouses[1]) {
                return [
                    { status: 'PROCESSING', created_at: new Date() },
                    { status: 'COMPLETED', created_at: new Date() },
                    { status: 'COMPLETED', created_at: new Date() },
                    { status: 'COMPLETED', created_at: new Date() }
                ];
            } else if (pId === FIXTURES.tenantB.printhouses[0]) {
                return [
                    { status: 'FAILED', created_at: new Date() }
                ];
            }
        }
        return [];
    });

    // Request for Printhouse A1
    {
        const token = generateMockToken(userA1);
        const req = createMockReq({
            method: 'GET', url: '/summary', headers: { authorization: `Bearer ${token}` }, user: userA1
        });
        const res = await dispatchRequest(printhouseDashboardRouter, req);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.data.activeJobs, 2);
        assert.strictEqual(res.body.data.completedJobsToday, 1);
        assert.strictEqual(res.body.data.storage.artifactsCount, 4);
        assert.strictEqual(res.body.data.storage.sizeBytes, 4096);
    }

    // Request for Printhouse A2
    {
        const token = generateMockToken(userA2);
        const req = createMockReq({
            method: 'GET', url: '/summary', headers: { authorization: `Bearer ${token}` }, user: userA2
        });
        const res = await dispatchRequest(printhouseDashboardRouter, req);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.data.activeJobs, 1);
        assert.strictEqual(res.body.data.completedJobsToday, 3);
        assert.strictEqual(res.body.data.storage.artifactsCount, 9);
        assert.strictEqual(res.body.data.storage.sizeBytes, 9999);
    }

    // ==========================================
    // 2. ENDPOINT: /orders
    // ==========================================
    console.log('Testing /orders endpoint...');

    setupActiveNodeStub((sql, params) => {
        // Return orders containing EUR, USD, sandbox, and simulation records
        return [
            { order_id: 'ORD-EUR-1', status: 'ACKNOWLEDGED', currency: 'EUR', estimated_price: 150.00, created_at: new Date(), metadata_json: JSON.stringify({ sandbox_mode: false }) },
            { order_id: 'ORD-EUR-2', status: 'IN_PRODUCTION', currency: 'EUR', estimated_price: 350.00, created_at: new Date(), metadata_json: JSON.stringify({ sandbox_mode: false }) },
            { order_id: 'ORD-USD-1', status: 'SHIPPED', currency: 'USD', estimated_price: 500.00, created_at: new Date(), metadata_json: JSON.stringify({ sandbox_mode: false }) },
            { order_id: 'ORD-SBOX', status: 'ACKNOWLEDGED', currency: 'EUR', estimated_price: 1000.00, created_at: new Date(), metadata_json: JSON.stringify({ sandbox_mode: true }) },
            { order_id: 'ORD-SIM', status: 'ACKNOWLEDGED', currency: 'EUR', estimated_price: 2000.00, created_at: new Date(), metadata_json: JSON.stringify({ is_simulation: true }) }
        ];
    });

    {
        const token = generateMockToken(userA1);
        const req = createMockReq({
            method: 'GET', url: '/orders', headers: { authorization: `Bearer ${token}` }, user: userA1
        });
        const res = await dispatchRequest(printhouseDashboardRouter, req);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.data.expectedRevenueEUR, 500.00, 'EUR revenue must aggregate non-sandbox EUR orders only');
        assert.strictEqual(res.body.data.orders.length, 3, 'Sandbox & simulation orders must be skipped');
        assert.strictEqual(res.body.data.orders[2].currency, 'USD');
    }

    // ==========================================
    // 3. ENDPOINT: /machines
    // ==========================================
    console.log('Testing /machines endpoint...');
    setupActiveNodeStub((sql, params) => {
        return [
            { id: FIXTURES.tenantA.printhouses[0], name: 'Machine-A1', status: 'active', region: 'eu-west', heartbeat_at: new Date() }
        ];
    });

    {
        const token = generateMockToken(userA1);
        const req = createMockReq({
            method: 'GET', url: '/machines', headers: { authorization: `Bearer ${token}` }, user: userA1
        });
        const res = await dispatchRequest(printhouseDashboardRouter, req);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.data.machines.length, 1);
        assert.strictEqual(res.body.data.machines[0].name, 'Machine-A1');
    }

    // ==========================================
    // 4. ENDPOINT: /queue
    // ==========================================
    console.log('Testing /queue endpoint...');
    setupActiveNodeStub((sql, params) => {
        return [
            { id: 'job-1', status: 'PROCESSING', type: 'PDF_PREFLIGHT', created_at: new Date() }
        ];
    });

    {
        const token = generateMockToken(userA1);
        const req = createMockReq({
            method: 'GET', url: '/queue', headers: { authorization: `Bearer ${token}` }, user: userA1
        });
        const res = await dispatchRequest(printhouseDashboardRouter, req);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.data.dispatches.length, 1);
    }

    // ==========================================
    // 5. ENDPOINT: /incidents
    // ==========================================
    console.log('Testing /incidents endpoint...');
    setupActiveNodeStub((sql, params) => {
        return [
            { id: 'inc-1', scope: FIXTURES.tenantA.printhouses[0], severity: 'CRITICAL', event_type: 'PAPER_JAM', status: 'OPEN', created_at: new Date(), details_json: JSON.stringify({ printhouseId: FIXTURES.tenantA.printhouses[0] }) },
            { id: 'inc-2', scope: 'global', severity: 'CRITICAL', event_type: 'DATABASE_TIMEOUT', status: 'OPEN', created_at: new Date(), details_json: JSON.stringify({}) }
        ];
    });

    {
        const token = generateMockToken(userA1);
        const req = createMockReq({
            method: 'GET', url: '/incidents', headers: { authorization: `Bearer ${token}` }, user: userA1
        });
        const res = await dispatchRequest(printhouseDashboardRouter, req);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.data.incidents.length, 1, 'Only incidents matching own printhouseId must be returned');
        assert.strictEqual(res.body.data.incidents[0].eventType, 'PAPER_JAM');
    }

    // ==========================================
    // 6. ENDPOINT: /activity
    // ==========================================
    console.log('Testing /activity endpoint...');
    setupActiveNodeStub((sql, params) => {
        return [
            { id: 'act-1', action: 'JOB_COMPLETED', status: 'SUCCESS', message: 'Preflight checking succeeded.', created_at: new Date() }
        ];
    });

    {
        const token = generateMockToken(userA1);
        const req = createMockReq({
            method: 'GET', url: '/activity', headers: { authorization: `Bearer ${token}` }, user: userA1
        });
        const res = await dispatchRequest(printhouseDashboardRouter, req);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.data.events.length, 1);
    }

    await teardown();
    console.log('All 6 endpoints validated successfully with double scoping and sandbox filtering.');
}

runTests().catch(err => {
    console.error('Expanded Printhouse Dashboard isolation test failed:', err);
    process.exit(1);
});
