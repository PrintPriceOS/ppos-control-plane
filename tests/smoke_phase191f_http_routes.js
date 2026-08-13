/**
 * tests/smoke_phase191f_http_routes.js
 * 
 * HTTP integration tests for Phase 191F: Pricing Routes, Auth gating,
 * Protected field validation, and Multi-tenant boundaries.
 */
const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const originalQuery = db.query; // Save the original query before test helper hijacks it!
const { FIXTURES, generateMockToken, createMockReq, dispatchRequest, teardown } = require('./security_test_helper');
db.query = originalQuery; // Restore it!
const pricingRouter = require('../src/api/routes/printhousePricingRoutes');

const TEST_TENANT_A = FIXTURES.tenantA.tenantId;
const TEST_TENANT_B = FIXTURES.tenantB.tenantId;

async function setupFixtures() {
    await db.query(
        "INSERT IGNORE INTO tenants (id, name, status, plan) VALUES (?, 'Tenant A', 'ACTIVE', 'ENTERPRISE')",
        [TEST_TENANT_A]
    );
    await db.query(
        "INSERT IGNORE INTO tenants (id, name, status, plan) VALUES (?, 'Tenant B', 'ACTIVE', 'ENTERPRISE')",
        [TEST_TENANT_B]
    );
}

async function cleanFixtures() {
    await db.query('DELETE FROM printhouse_quantity_tiers WHERE pricing_rule_id IN (SELECT id FROM printhouse_pricing_rules WHERE tenant_id IN (?, ?))', [TEST_TENANT_A, TEST_TENANT_B]);
    await db.query('DELETE FROM printhouse_pricing_rules WHERE tenant_id IN (?, ?)', [TEST_TENANT_A, TEST_TENANT_B]);
    await db.query('DELETE FROM printhouse_price_books WHERE tenant_id IN (?, ?)', [TEST_TENANT_A, TEST_TENANT_B]);
    await db.query('DELETE FROM tenants WHERE id IN (?, ?)', [TEST_TENANT_A, TEST_TENANT_B]);
}

async function runTests() {
    console.log('=== Starting Phase 191F HTTP Routes Smoke Tests ===\n');
    await setupFixtures();

    // 1. Role Auth Gating: non-admin (e.g. standard USER) returns 403
    {
        const user = {
            id: 'standard-user-1',
            role: 'CUSTOMER_REPRESENTATIVE',
            tenantId: TEST_TENANT_A
        };
        const token = generateMockToken(user);
        const req = createMockReq({
            method: 'GET',
            url: '/price-books',
            headers: { authorization: `Bearer ${token}` },
            user
        });
        const res = await dispatchRequest(pricingRouter, req);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.error, 'FORBIDDEN: Invalid role');
        console.log('✓ Non-admin role blocked from accessing pricing onboarding (403)');
    }

    // 2. Printhouse operator can create a draft price book (211 created)
    let pbId = null;
    {
        const user = {
            id: 'ph-admin-1',
            role: 'PRINTHOUSE_ADMIN',
            tenantId: TEST_TENANT_A
        };
        const token = generateMockToken(user);
        const req = createMockReq({
            method: 'POST',
            url: '/price-books',
            headers: { authorization: `Bearer ${token}` },
            body: {
                name: 'Main Price List 2026',
                currency: 'EUR'
            },
            user
        });
        const res = await dispatchRequest(pricingRouter, req);
        assert.strictEqual(res.statusCode, 211);
        assert.strictEqual(res.body.ok, true);
        assert.ok(res.body.data.id);
        pbId = res.body.data.id;
        console.log('✓ Printhouse operator successfully creates draft price book');
    }

    // 3. Field Protection Gate: Printhouse operator tries to update protected column -> 400 FIELD_NOT_EDITABLE
    {
        const user = {
            id: 'ph-admin-1',
            role: 'PRINTHOUSE_ADMIN',
            tenantId: TEST_TENANT_A
        };
        const token = generateMockToken(user);
        const req = createMockReq({
            method: 'PUT',
            url: `/price-books/${pbId}`,
            headers: { authorization: `Bearer ${token}` },
            body: {
                name: 'Main Price List 2026 - Modified',
                approved: true // Protected field!
            },
            user
        });
        const res = await dispatchRequest(pricingRouter, req);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.error, 'FIELD_NOT_EDITABLE');
        console.log('✓ Self-service modification of protected fields rejected (400 FIELD_NOT_EDITABLE)');
    }

    // 4. Global Admin can update protected fields
    {
        const user = {
            id: 'global-admin-1',
            role: 'SUPER_ADMIN',
            tenantId: TEST_TENANT_A
        };
        const token = generateMockToken(user);
        const req = createMockReq({
            method: 'PUT',
            url: `/price-books/${pbId}`,
            headers: { authorization: `Bearer ${token}` },
            body: {
                name: 'Main Price List 2026 - Approved by Admin',
                customer_contract_id: 'contract-vip-123' // Protected, allowed for global admin
            },
            user
        });
        const res = await dispatchRequest(pricingRouter, req);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.ok, true);
        console.log('✓ Global system admin allowed to edit protected fields');
    }

    // 5. Tenant Isolation: Tenant B cannot view Tenant A\'s price book -> returns 404/Not Found or Empty
    {
        const user = {
            id: 'ph-admin-tenant-b',
            role: 'PRINTHOUSE_ADMIN',
            tenantId: TEST_TENANT_B
        };
        const token = generateMockToken(user);
        const req = createMockReq({
            method: 'GET',
            url: `/price-books/${pbId}`,
            headers: { authorization: `Bearer ${token}` },
            user
        });
        const res = await dispatchRequest(pricingRouter, req);
        assert.strictEqual(res.statusCode, 404);
        assert.strictEqual(res.body.error, 'Price book not found');
        console.log('✓ Tenant isolation holds (Tenant B cannot read Tenant A data)');
    }

    // 6. Tenant Isolation on Rules listing
    {
        const user = {
            id: 'ph-admin-tenant-b',
            role: 'PRINTHOUSE_ADMIN',
            tenantId: TEST_TENANT_B
        };
        const token = generateMockToken(user);
        const req = createMockReq({
            method: 'GET',
            url: `/price-books/${pbId}/rules`,
            headers: { authorization: `Bearer ${token}` },
            user
        });
        const res = await dispatchRequest(pricingRouter, req);
        // Expecting 404 because price book is not found for tenant B
        assert.strictEqual(res.statusCode, 404);
        console.log('✓ Tenant isolation holds (Tenant B cannot list rules for Tenant A book)');
    }

    await cleanFixtures();
    await teardown();
    console.log('\nAll Phase 191F HTTP route smoke tests passed successfully!');
}

runTests().catch(err => {
    console.error('HTTP route smoke tests failed:', err);
    cleanFixtures().finally(() => process.exit(1));
});
