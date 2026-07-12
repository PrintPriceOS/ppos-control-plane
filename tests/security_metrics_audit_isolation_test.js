/**
 * tests/security_metrics_audit_isolation_test.js
 * 
 * Tests multi-tenant isolation for aggregated Metrics and Dashboard Overview data.
 */
const assert = require('assert');
const { FIXTURES, generateMockToken, createMockReq, dispatchRequest, setQueryStub, teardown } = require('./security_test_helper');
const dashboardRouter = require('../src/api/routes/adminDashboard');

async function runTests() {
    console.log('Running Metrics & Audit isolation tests...');

    // Stub query execution to verify that tenant_id is sent in query parameters
    let tenantFilterSent = false;
    
    setQueryStub((sql, params) => {
        if (params.includes(FIXTURES.tenantA.tenantId)) {
            tenantFilterSent = true;
        }
        return [];
    });

    // 1. Overview request enforces tenant_id mapping in database queries
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
            url: '/overview',
            headers: { authorization: `Bearer ${token}` },
            user
        });
        
        const res = await dispatchRequest(dashboardRouter, req);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(tenantFilterSent, true, 'Overview dashboard queries must be filtered by the authenticated tenant_id');
        console.log('✓ Metrics Overview enforces tenant isolation at query level');
    }

    await teardown();
}

runTests().catch(err => {
    console.error('Metrics & Audit isolation test failed:', err);
    process.exit(1);
});
