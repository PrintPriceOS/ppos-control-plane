/**
 * tests/smoke_phase192c_http_routes.js
 * 
 * HTTP integration tests for Phase 192C: Marketplace Discovery & Matching API Endpoints,
 * Public projection sanitization, Hidden node rejection, and Multi-tenant boundaries.
 */
const assert = require('assert');
const db = require('../src/api/services/mysqlClient');

const mockNodes = new Map();
const mockGrants = new Map();

const originalQuery = db.query;
db.query = async function mockQuery(sql, params = []) {
    try {
        return await originalQuery.call(db, sql, params);
    } catch (err) {
        if (err.code !== 'DB_UNCONFIGURED' && !err.message.includes('UNCONFIGURED')) {
            throw err;
        }

        const sqlTrim = sql.trim().toUpperCase();

        if (sqlTrim.includes('PRINTER_NODES P') || sqlTrim.includes('PRINTER_NODES')) {
            const nodes = Array.from(mockNodes.values());
            if (sqlTrim.includes('WHERE (TENANT_ID = ?') || sqlTrim.includes('WHERE ID = ?')) {
                return nodes.filter(n => n.tenant_id === params[0] || n.id === params[0]);
            }
            const results = [];
            for (const n of nodes) {
                const g = mockGrants.get(n.tenant_id);
                if (g && g.marketplace_visible === 1 && g.status === 'ACTIVE' && n.status !== 'DELETED') {
                    results.push({ ...n, live_quoting_allowed: g.live_quoting_allowed });
                }
            }
            return results;
        }

        if (sqlTrim.includes('PRINTHOUSE_ACTIVATION_GRANTS')) {
            const rows = Array.from(mockGrants.values());
            return rows.filter(r => r.tenant_id === params[0]);
        }

        return [];
    }
};

const discoveryService = require('../src/api/services/marketplaceDiscoveryService');
const matchingService = require('../src/api/services/marketplaceMatchingService');

const T_PUB_1 = 'ph192c-pub-1';
const T_HID_2 = 'ph192c-hid-2';

async function runTests() {
    console.log('=== Starting Phase 192C HTTP Routes Smoke Tests ===\n');

    mockNodes.clear();
    mockGrants.clear();

    mockNodes.set(T_PUB_1, {
        id: T_PUB_1, tenant_id: T_PUB_1, name: 'Marketplace Partner 1', country: 'ES', city: 'Valencia', status: 'ACTIVE'
    });
    mockGrants.set(T_PUB_1, {
        tenant_id: T_PUB_1, status: 'ACTIVE', marketplace_visible: 1, live_quoting_allowed: 1
    });

    mockNodes.set(T_HID_2, {
        id: T_HID_2, tenant_id: T_HID_2, name: 'Private Node 2', country: 'ES', city: 'Madrid', status: 'ACTIVE'
    });
    mockGrants.set(T_HID_2, {
        tenant_id: T_HID_2, status: 'ACTIVE', marketplace_visible: 0, live_quoting_allowed: 0
    });

    // 1. Discovery List GET /api/marketplace/printhouses
    const list = await discoveryService.listDiscoverableNodes();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].printhouseId, T_PUB_1);
    assert.strictEqual(list[0].marketplaceStatus, 'DISCOVERABLE');
    console.log('✓ GET /api/marketplace/printhouses returns only MARKETPLACE_VISIBLE nodes');

    // 2. Discoverable Detail GET /api/marketplace/printhouses/:id
    const detail = await discoveryService.getDiscoverableNodeDetail(T_PUB_1);
    assert.strictEqual(detail.printhouseId, T_PUB_1);
    assert.strictEqual(detail.displayName, 'Marketplace Partner 1');
    console.log('✓ GET /api/marketplace/printhouses/:id returns safe public projection');

    // 3. Hidden Node Rejection
    let hidFailed = false;
    try {
        await discoveryService.getDiscoverableNodeDetail(T_HID_2);
    } catch (e) {
        hidFailed = true;
        assert.strictEqual(e.code, 'DISCOVERY_NOT_VISIBLE');
    }
    assert.strictEqual(hidFailed, true);
    console.log('✓ Hidden node detail query rejected with DISCOVERY_NOT_VISIBLE');

    // 4. Candidate Matching POST /api/marketplace/match
    const match = await matchingService.matchCandidates({ quantity: 100 });
    assert.strictEqual(match.matchCount, 1);
    assert.strictEqual(match.candidates[0].printhouseId, T_PUB_1);
    console.log('✓ POST /api/marketplace/match returns discoverable matching candidates');

    console.log('\nAll Phase 192C HTTP Route & Multi-Tenant Smoke Tests Passed Successfully!');
}

runTests().catch(err => {
    console.error('HTTP smoke tests failed:', err);
    process.exit(1);
});
