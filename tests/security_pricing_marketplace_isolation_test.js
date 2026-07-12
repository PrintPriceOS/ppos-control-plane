/**
 * tests/security_pricing_marketplace_isolation_test.js
 * 
 * Tests multi-tenant and printhouse isolation for Pricing and Marketplace domains.
 */
const assert = require('assert');
const { FIXTURES, generateMockToken, createMockReq, dispatchRequest, teardown } = require('./security_test_helper');
const ordersRouter = require('../src/api/routes/adminMarketplaceOrders');

async function runTests() {
    console.log('Running Pricing & Marketplace isolation tests...');

    // Mock orderService.getOrder response
    const orderService = require('../src/api/services/marketplaceOrderService');
    const originalGetOrder = orderService.getOrder;
    orderService.getOrder = async (id) => {
        if (id === FIXTURES.tenantA.orderId) {
            return { id, tenantId: FIXTURES.tenantA.tenantId, printhouseId: FIXTURES.tenantA.printhouses[0] };
        }
        if (id === FIXTURES.tenantB.orderId) {
            return { id, tenantId: FIXTURES.tenantB.tenantId, printhouseId: FIXTURES.tenantB.printhouses[0] };
        }
        return null;
    };

    // 1. Own Order Allowed
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
            url: `/${FIXTURES.tenantA.orderId}`,
            headers: { authorization: `Bearer ${token}` },
            user
        });
        const res = await dispatchRequest(ordersRouter, req);
        assert.notStrictEqual(res.statusCode, 403);
        console.log('✓ Own Marketplace Order allowed');
    }

    // 2. Cross-Tenant Order Denied
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
            url: `/${FIXTURES.tenantB.orderId}`,
            headers: { authorization: `Bearer ${token}` },
            user
        });
        const res = await dispatchRequest(ordersRouter, req);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.error, 'FORBIDDEN');
        console.log('✓ Cross-Tenant Marketplace Order access denied');
    }

    // Clean up
    orderService.getOrder = originalGetOrder;
    console.log('All Pricing & Marketplace isolation tests passed!');
    await teardown();
}

runTests().catch(err => {
    console.error('Pricing & Marketplace isolation test failed:', err);
    process.exit(1);
});
