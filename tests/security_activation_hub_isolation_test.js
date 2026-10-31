/**
 * tests/security_activation_hub_isolation_test.js
 * 
 * Tests multi-tenant and printhouse isolation for the Activation Hub domain.
 */
const assert = require('assert');
const { FIXTURES, createMockReq, dispatchRequest, setQueryStub, teardown } = require('./security_test_helper');
const router = require('../src/api/routes/printhouseCapabilities');

async function runTests() {
    console.log('Running Activation Hub isolation tests...');

    // Stub getPrinthouse database results
    setQueryStub((sql, params) => {
        if (sql.includes('SELECT') && (sql.includes('printhouses') || sql.includes('printer_nodes'))) {
            const id = params[0];
            if (id === FIXTURES.tenantA.printhouses[0]) {
                return [{ id: id, tenant_id: FIXTURES.tenantA.tenantId }];
            }
            if (id === FIXTURES.tenantA.printhouses[1]) {
                return [{ id: id, tenant_id: FIXTURES.tenantA.tenantId }];
            }
            if (id === FIXTURES.tenantB.printhouses[0]) {
                return [{ id: id, tenant_id: FIXTURES.tenantB.tenantId }];
            }
        }
        return [];
    });

    // 1. Own Resource Allowed
    {
        const req = createMockReq({
            method: 'GET',
            url: `/${FIXTURES.tenantA.printhouses[0]}`,
            user: {
                id: 'user-ph-123',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: FIXTURES.tenantA.tenantId,
                printhouseId: FIXTURES.tenantA.printhouses[0]
            }
        });
        const res = await dispatchRequest(router, req);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.ok, true);
        console.log('✓ Own Activation Hub profile allowed');
    }

    // 2. Cross-Tenant Denied
    {
        const req = createMockReq({
            method: 'GET',
            url: `/${FIXTURES.tenantB.printhouses[0]}`,
            user: {
                id: 'user-ph-123',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: FIXTURES.tenantA.tenantId,
                printhouseId: FIXTURES.tenantA.printhouses[0]
            }
        });
        const res = await dispatchRequest(router, req);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.error, 'FORBIDDEN');
        console.log('✓ Cross-Tenant Activation Hub profile access denied');
    }

    // 3. Same-Tenant Cross-Printhouse Denied
    {
        const req = createMockReq({
            method: 'GET',
            url: `/${FIXTURES.tenantA.printhouses[1]}`,
            user: {
                id: 'user-ph-123',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: FIXTURES.tenantA.tenantId,
                printhouseId: FIXTURES.tenantA.printhouses[0]
            }
        });
        const res = await dispatchRequest(router, req);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.error, 'FORBIDDEN');
        console.log('✓ Same-Tenant Cross-Printhouse access denied');
    }

    // 4. Global Admin Allowed
    {
        const req = createMockReq({
            method: 'GET',
            url: `/${FIXTURES.tenantA.printhouses[0]}`,
            user: {
                id: 'admin-123',
                role: 'SUPER_ADMIN',
                isSuperAdmin: true
            }
        });
        const res = await dispatchRequest(router, req);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.ok, true);
        console.log('✓ Global admin allowed access to any Activation Hub profile');
    }

    await teardown();
}

runTests().catch(err => {
    console.error('Activation Hub isolation test failed:', err);
    process.exit(1);
});
