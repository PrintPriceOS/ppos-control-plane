/**
 * tests/security_settings_tenant_config_isolation_test.js
 * 
 * Tests role isolation and settings access protection for Tenants and Settings.
 */
const assert = require('assert');
const { FIXTURES, generateMockToken, createMockReq, dispatchRequest, setQueryStub, teardown } = require('./security_test_helper');
const adminRouter = require('../src/api/routes/admin');

async function runTests() {
    console.log('Running Settings & Tenant Config isolation tests...');

    // Stub query execution to prevent failures on MySQL insert
    setQueryStub(() => [{ plan: 'BASIC', status: 'ACTIVE' }]);

    // 1. Non-admin (Printhouse User) Access Denied to POST /tenants/:id (should return 403)
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
            url: `/tenants/${FIXTURES.tenantA.tenantId}`,
            headers: { authorization: `Bearer ${token}` },
            user,
            body: { name: 'New Tenant Name' }
        });
        const res = await dispatchRequest(adminRouter, req);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.error.code, 'FORBIDDEN');
        console.log('✓ Printhouse role blocked from updating tenant settings');
    }

    // 2. Global Admin Access Allowed
    {
        const user = {
            id: 'admin-123',
            role: 'SUPER_ADMIN',
            isSuperAdmin: true
        };
        const token = generateMockToken(user);
        const req = createMockReq({
            method: 'POST',
            url: `/tenants/${FIXTURES.tenantA.tenantId}`,
            headers: { authorization: `Bearer ${token}` },
            user,
            body: { name: 'New Tenant Name' }
        });
        const res = await dispatchRequest(adminRouter, req);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.ok, true);
        console.log('✓ Global admin allowed to update tenant settings');
    }

    await teardown();
}

runTests().catch(err => {
    console.error('Settings & Tenant Config isolation test failed:', err);
    process.exit(1);
});
