/**
 * tests/security_onboarding_isolation_test.js
 * 
 * Tests multi-tenant and role isolation for Onboarding and Observability domains.
 */
const assert = require('assert');
const { FIXTURES, generateMockToken, createMockReq, dispatchRequest, teardown } = require('./security_test_helper');
const adminRouter = require('../src/api/routes/admin');

async function runTests() {
    console.log('Running Onboarding & Observability isolation tests...');

    // 1. Non-admin (Printhouse User) Access Denied to Observability Funnel (should return 403)
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
            url: '/observability/funnel',
            headers: {
                authorization: `Bearer ${token}`
            },
            user
        });
        const res = await dispatchRequest(adminRouter, req);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.error.code, 'FORBIDDEN');
        console.log('✓ Printhouse role blocked from global onboarding observability');
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
            url: '/observability/funnel',
            headers: {
                authorization: `Bearer ${token}`
            },
            user
        });
        
        // Mock service responses
        const service = require('../src/api/services/onboardingObservabilityService');
        const originalFunnel = service.getActivationFunnel;
        service.getActivationFunnel = async () => ({ ok: true, funnel: [] });

        const res = await dispatchRequest(adminRouter, req);
        assert.strictEqual(res.statusCode, 200);
        
        // Clean up
        service.getActivationFunnel = originalFunnel;
        console.log('✓ Global admin allowed access to onboarding observability');
    }

    await teardown();
}

runTests().catch(err => {
    console.error('Onboarding & Observability isolation test failed:', err);
    process.exit(1);
});
