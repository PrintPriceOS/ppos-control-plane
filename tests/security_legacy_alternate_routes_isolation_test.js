/**
 * tests/security_legacy_alternate_routes_isolation_test.js
 * 
 * Tests multi-tenant isolation on legacy or alternate route definitions.
 */
const assert = require('assert');
const { FIXTURES, generateMockToken, createMockReq, dispatchRequest, teardown } = require('./security_test_helper');
const adminRouter = require('../src/api/routes/admin');

async function runTests() {
    console.log('Running Legacy & Alternate Routes isolation tests...');

    // 1. Unauthenticated request without token returns 401
    {
        const req = createMockReq({
            method: 'GET',
            url: '/tenants'
        });
        const res = await dispatchRequest(adminRouter, req);
        assert.strictEqual(res.statusCode, 401);
        console.log('✓ Unauthenticated request blocked with 401');
    }

    await teardown();
}

runTests().catch(err => {
    console.error('Legacy & Alternate Routes isolation test failed:', err);
    process.exit(1);
});
