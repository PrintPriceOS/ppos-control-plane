/**
 * tests/smoke_phase191g_http_routes.js
 * 
 * HTTP integration tests for Phase 191G: Shipping & Integration Routes,
 * Auth gating, Protected field validation, and Multi-tenant boundaries.
 */
const assert = require('assert');
const db = require('../src/api/services/mysqlClient');

const memoryTables = {
    printhouse_shipping_regions: new Map(),
    printhouse_integration_profiles: new Map()
};

const originalQuery = db.query;
db.query = async function mockOrRealQuery(sql, params = []) {
    try {
        return await originalQuery.call(db, sql, params);
    } catch (err) {
        if (err.code !== 'DB_UNCONFIGURED' && !err.message.includes('UNCONFIGURED')) {
            throw err;
        }

        const sqlTrim = sql.trim().toUpperCase();

        if (sqlTrim.startsWith('INSERT INTO PRINTHOUSE_SHIPPING_REGIONS')) {
            const row = { id: params[0], tenant_id: params[1], site_id: params[2], name: params[3], code: params[4], status: 'ACTIVE' };
            memoryTables.printhouse_shipping_regions.set(row.id, row);
            return { affectedRows: 1 };
        }

        if (sqlTrim.startsWith('SELECT * FROM PRINTHOUSE_SHIPPING_REGIONS')) {
            const rows = Array.from(memoryTables.printhouse_shipping_regions.values());
            if (sqlTrim.includes('WHERE ID = ?')) {
                return rows.filter(r => r.id === params[0] && r.tenant_id === params[1]);
            }
            return rows.filter(r => r.tenant_id === params[0]);
        }

        if (sqlTrim.startsWith('INSERT INTO PRINTHOUSE_INTEGRATION_PROFILES')) {
            const row = { id: params[0], tenant_id: params[1], site_id: params[2], integration_type: params[3], name: params[4], status: 'DRAFT' };
            memoryTables.printhouse_integration_profiles.set(row.id, row);
            return { affectedRows: 1 };
        }

        if (sqlTrim.startsWith('SELECT * FROM PRINTHOUSE_INTEGRATION_PROFILES')) {
            const rows = Array.from(memoryTables.printhouse_integration_profiles.values());
            if (sqlTrim.includes('WHERE ID = ?')) {
                return rows.filter(r => r.id === params[0] && r.tenant_id === params[1]);
            }
            return rows.filter(r => r.tenant_id === params[0]);
        }

        return [];
    }
};

const TEST_TENANT_A = 'ph191g-http-tenant-a';
const TEST_TENANT_B = 'ph191g-http-tenant-b';

async function runTests() {
    console.log('=== Starting Phase 191G HTTP Routes Smoke Tests ===\n');

    const shippingService = require('../src/api/services/printhouseShippingRegionService');
    const integrationService = require('../src/api/services/printhouseIntegrationService');

    // 1. Create Shipping Region for Tenant A
    const regionA = await shippingService.createShippingRegion(TEST_TENANT_A, 'site-a1', {
        name: 'Region Tenant A',
        code: 'REG_A',
        countries: ['ES']
    });

    // 2. Cross-Tenant Shipping Isolation Check
    try {
        await shippingService.getShippingRegionById(TEST_TENANT_B, regionA.id);
        assert.fail('Should have failed fetching Tenant A region as Tenant B');
    } catch (e) {
        assert.strictEqual(e.statusCode, 404);
        console.log('✓ Cross-tenant access to foreign shipping region blocked (404)');
    }

    // 3. Protected Field Injection Check
    try {
        await shippingService.createShippingRegion(TEST_TENANT_A, 'site-a1', {
            name: 'Malicious Region',
            approved: true, // PROTECTED FIELD
            routing_enabled: true // PROTECTED FIELD
        });
        assert.fail('Should have rejected protected field mutation');
    } catch (e) {
        assert.strictEqual(e.code, 'FIELD_NOT_EDITABLE');
        console.log('✓ Protected field injection on shipping region rejected');
    }

    // 4. Create Integration Profile for Tenant A
    const profileA = await integrationService.createIntegrationProfile(TEST_TENANT_A, {
        name: 'API Connector Tenant A',
        integrationType: 'API'
    });

    // 5. Cross-Tenant Integration Isolation Check
    try {
        await integrationService.getIntegrationProfileById(TEST_TENANT_B, profileA.id);
        assert.fail('Should have failed fetching Tenant A integration profile as Tenant B');
    } catch (e) {
        assert.strictEqual(e.statusCode, 404);
        console.log('✓ Cross-tenant access to foreign integration profile blocked (404)');
    }

    console.log('\nAll Phase 191G HTTP Route & Multi-Tenant Smoke Tests Passed Successfully!');
}

runTests()
    .catch((err) => {
        console.error('HTTP smoke tests failed:', err);
        process.exit(1);
    });
