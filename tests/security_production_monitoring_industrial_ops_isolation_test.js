/**
 * tests/security_production_monitoring_industrial_ops_isolation_test.js
 * 
 * Tests role isolation for Production Monitoring and Industrial Ops (Routing).
 */
const assert = require('assert');
const { FIXTURES, generateMockToken, createMockReq, dispatchRequest, teardown } = require('./security_test_helper');
const adminRouter = require('../src/api/routes/admin');

async function runTests() {
    console.log('Running Production Monitoring & Industrial Ops isolation tests...');

    // 1. Non-admin (Printhouse User) Access Denied to /routing/decision (should return 403)
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
            url: '/routing/decision/logs',
            headers: { authorization: `Bearer ${token}` },
            user
        });
        const res = await dispatchRequest(adminRouter, req);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.error.code, 'FORBIDDEN');
        console.log('✓ Printhouse role blocked from global industrial routing decision logs');
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
            method: 'GET',
            url: '/routing/decision/logs',
            headers: { authorization: `Bearer ${token}` },
            user
        });
        
        const res = await dispatchRequest(adminRouter, req);
        assert.notStrictEqual(res.statusCode, 403);
        console.log('✓ Global admin bypasses industrial routing 403 guard');
    }

    await teardown();
}

runTests().catch(err => {
    console.error('Production Monitoring & Industrial Ops isolation test failed:', err);
    process.exit(1);
});
