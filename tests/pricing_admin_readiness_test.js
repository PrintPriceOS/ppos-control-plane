/**
 * tests/pricing_admin_readiness_test.js
 * 
 * Tests isolation of /readiness-audit and /my-readiness endpoints.
 */
const assert = require('assert');
const { FIXTURES, generateMockToken, createMockReq, dispatchRequest, teardown } = require('./security_test_helper');
const pricingRouter = require('../src/api/routes/pricingAdmin');

async function runTests() {
    console.log('Running Pricing Admin Readiness Isolation Tests (Phase 190.2)...');

    // Mock DB queries for testing
    const mysql = require('../src/api/services/mysqlClient');
    const originalQuery = mysql.query;
    mysql.query = async (sql, params) => {
        if (sql.includes("printer_nodes") && sql.includes("id = ?")) {
            return [{ status: 'active' }];
        }
        if (sql.includes("print_nodes") && sql.includes("id = ?")) {
            return [{ id: params[0], company_name: "Mock Print", rates_json: '{"schemaVersion": 1, "currency": "EUR"}' }];
        }
        if (sql.includes("print_nodes") && sql.includes("status = 'ONLINE'")) {
            return [
                { id: 'ph-a', company_name: "Print A", rates_json: '{"schemaVersion": 1, "currency": "EUR"}' },
                { id: 'ph-b', company_name: "Print B", rates_json: null }
            ];
        }
        return [];
    };

    // 1. Printhouse cannot access global readiness audit (403)
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
            url: '/readiness-audit',
            headers: { authorization: `Bearer ${token}` },
            user
        });
        const res = await dispatchRequest(pricingRouter, req);
        assert.strictEqual(res.statusCode, 403, "Printhouse should be forbidden from global audit");
        console.log('✓ Printhouse blocked from global audit');
    }

    // 2. SuperAdmin can access global audit
    {
        const user = {
            id: 'admin-123',
            role: 'SUPER_ADMIN',
            isSuperAdmin: true
        };
        const token = generateMockToken(user);
        const req = createMockReq({
            method: 'GET',
            url: '/readiness-audit',
            headers: { authorization: `Bearer ${token}` },
            user
        });
        const res = await dispatchRequest(pricingRouter, req);
        assert.strictEqual(res.statusCode, 200);
        assert.ok(res.body.audit.length > 0);
        assert.ok(!res.body.audit[0].rates_json, "Should not leak rates payload");
        console.log('✓ SuperAdmin allowed to global audit and no payload leaked');
    }

    // 3. Printhouse accesses /my-readiness (gets only their data)
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
            url: '/my-readiness',
            headers: { authorization: `Bearer ${token}` },
            user
        });
        const res = await dispatchRequest(pricingRouter, req);
        if (res.statusCode !== 200) console.error("Error body:", res.body);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.printerId, FIXTURES.tenantA.printhouses[0]);
        console.log('✓ Printhouse can access my-readiness');
    }

    // Restore
    mysql.query = originalQuery;
    await teardown();
}

runTests().catch(err => {
    console.error('Pricing Admin Readiness isolation test failed:', err);
    process.exit(1);
});
