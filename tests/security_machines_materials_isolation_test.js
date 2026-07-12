/**
 * tests/security_machines_materials_isolation_test.js
 * 
 * Tests multi-tenant and printhouse isolation for Machines and Materials domains.
 */
const assert = require('assert');
const { FIXTURES, generateMockToken, createMockReq, dispatchRequest, setQueryStub, teardown } = require('./security_test_helper');
const machinesRouter = require('../src/api/routes/machinesAdmin');
const printhouseCapsRouter = require('../src/api/routes/printhouseCapabilities');

async function runTests() {
    console.log('Running Machines & Materials isolation tests...');

    // Stub database responses
    setQueryStub((sql, params) => {
        if (sql.includes('print_nodes')) {
            return [{
                id: FIXTURES.tenantA.machineId,
                tenant_id: FIXTURES.tenantA.tenantId,
                printhouse_id: FIXTURES.tenantA.printhouses[0],
                device_id: 'dev-1',
                node_status: 'ONLINE'
            }];
        }
        if (sql.includes('printhouses')) {
            const id = params[0];
            if (id === FIXTURES.tenantA.printhouses[0]) {
                return [{ id, tenant_id: FIXTURES.tenantA.tenantId }];
            }
            if (id === FIXTURES.tenantA.printhouses[1]) {
                return [{ id, tenant_id: FIXTURES.tenantA.tenantId }];
            }
            if (id === FIXTURES.tenantB.printhouses[0]) {
                return [{ id, tenant_id: FIXTURES.tenantB.tenantId }];
            }
        }
        return [];
    });

    // 1. Machines List - Scoped Own allowed
    {
        const user = {
            id: 'user-ph-123',
            role: 'PRINTHOUSE_ADMIN',
            tenantId: FIXTURES.tenantA.tenantId,
            printhouseId: FIXTURES.tenantA.printhouses[0]
        };
        const token = generateMockToken(user);
        const req = createMockReq({
            method: 'GET',
            url: '/',
            headers: { authorization: `Bearer ${token}` },
            user
        });
        const res = await dispatchRequest(machinesRouter, req);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.machines.length, 1);
        console.log('✓ GET /api/admin/machines - Own allowed: Passed');
    }

    // 2. Printhouse Capabilities machine mutation - Cross-tenant denied (PUT)
    {
        const user = {
            id: 'user-ph-123',
            role: 'PRINTHOUSE_ADMIN',
            tenantId: FIXTURES.tenantA.tenantId,
            printhouseId: FIXTURES.tenantA.printhouses[0]
        };
        const token = generateMockToken(user);
        const req = createMockReq({
            method: 'PUT',
            url: `/${FIXTURES.tenantB.printhouses[0]}/machines/${FIXTURES.tenantB.machineId}`,
            headers: { authorization: `Bearer ${token}` },
            user,
            body: { status: 'DEGRADED' }
        });
        const res = await dispatchRequest(printhouseCapsRouter, req);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.error, 'FORBIDDEN');
        console.log('✓ PUT /:printhouseId/machines/:machineId - Cross-tenant denied: Passed');
    }

    // 3. Printhouse Capabilities machine creation - Same-tenant cross-printhouse denied (POST)
    {
        const user = {
            id: 'user-ph-123',
            role: 'PRINTHOUSE_ADMIN',
            tenantId: FIXTURES.tenantA.tenantId,
            printhouseId: FIXTURES.tenantA.printhouses[0]
        };
        const token = generateMockToken(user);
        const req = createMockReq({
            method: 'POST',
            url: `/${FIXTURES.tenantA.printhouses[1]}/machines`, // Other printer in same tenant
            headers: { authorization: `Bearer ${token}` },
            user,
            body: { model: 'Press-X' }
        });
        const res = await dispatchRequest(printhouseCapsRouter, req);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.error, 'FORBIDDEN');
        console.log('✓ POST /:printhouseId/machines - Same-tenant cross-printhouse denied: Passed');
    }

    console.log('All Machines & Materials isolation tests passed!');
    await teardown();
}

runTests().catch(err => {
    console.error('Machines & Materials isolation test failed:', err);
    process.exit(1);
});
