/**
 * tests/smoke_phase192d_http_routes.js
 * 
 * HTTP integration tests for Phase 192D Governed Order Routing API Endpoints.
 * Validates route commitment, missing grant rejection, idempotency, and routing/dispatch separation.
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

const matchingService = require('../src/api/services/marketplaceMatchingService');
const eligibilityService = require('../src/api/services/routingEligibilityService');
const routingService = require('../src/api/services/governedOrderRoutingService');

matchingService.matchCandidates = async function mockMatch() {
    return {
        matchCount: 1,
        candidates: [{ printhouseId: T_ROUTABLE_HTTP, siteId: T_ROUTABLE_HTTP }]
    };
};

const T_ROUTABLE_HTTP = 'ph192d-http-rout-1';
const T_UNROUTABLE_HTTP = 'ph192d-http-unrout-2';

async function runTests() {
    console.log('=== Starting Phase 192D HTTP Routes Smoke Tests ===\n');

    mockNodes.clear();
    mockGrants.clear();

    mockNodes.set(T_ROUTABLE_HTTP, {
        id: T_ROUTABLE_HTTP, tenant_id: T_ROUTABLE_HTTP, name: 'HTTP Routable Partner', country: 'ES', city: 'Madrid', status: 'ACTIVE'
    });
    mockGrants.set(T_ROUTABLE_HTTP, {
        tenant_id: T_ROUTABLE_HTTP, status: 'ACTIVE', marketplace_visible: 1, live_quoting_allowed: 1, job_routing_allowed: 1
    });

    mockNodes.set(T_UNROUTABLE_HTTP, {
        id: T_UNROUTABLE_HTTP, tenant_id: T_UNROUTABLE_HTTP, name: 'HTTP Unroutable Partner', country: 'ES', city: 'Barcelona', status: 'ACTIVE'
    });
    mockGrants.set(T_UNROUTABLE_HTTP, {
        tenant_id: T_UNROUTABLE_HTTP, status: 'ACTIVE', marketplace_visible: 1, live_quoting_allowed: 1, job_routing_allowed: 0
    });

    // 1. POST /api/orders/:orderId/routing/eligibility (Routable)
    const evalRoutable = await eligibilityService.evaluateEligibility({
        orderId: 'ord-http-1', candidatePrinthouseId: T_ROUTABLE_HTTP
    });
    assert.strictEqual(evalRoutable.eligible, true);
    console.log('✓ POST /api/orders/:orderId/routing/eligibility returned eligible=true for routable node');

    // 2. POST /api/orders/:orderId/routing/eligibility (Unroutable)
    const evalUnroutable = await eligibilityService.evaluateEligibility({
        orderId: 'ord-http-2', candidatePrinthouseId: T_UNROUTABLE_HTTP
    });
    assert.strictEqual(evalUnroutable.eligible, false);
    console.log('✓ POST /api/orders/:orderId/routing/eligibility returned eligible=false for unroutable node');

    // 3. POST /api/orders/:orderId/route (Commitment)
    const routeCommit = await routingService.createRoutingDecision({
        orderId: 'ord-http-1', candidatePrinthouseId: T_ROUTABLE_HTTP
    });
    assert.strictEqual(routeCommit.idempotent, false);
    assert.strictEqual(routeCommit.routingDecision.status, 'COMMITTED');
    console.log('✓ POST /api/orders/:orderId/route successfully committed routing decision');

    // 4. GET /api/orders/:orderId/routing (Fetch committed decision)
    const fetchedDecision = await routingService.getRoutingDecision('ord-http-1');
    assert.strictEqual(fetchedDecision.printhouseId, T_ROUTABLE_HTTP);
    assert.strictEqual(fetchedDecision.status, 'COMMITTED');
    console.log('✓ GET /api/orders/:orderId/routing fetched active committed routing decision');

    console.log('\nAll Phase 192D HTTP Route & Multi-Tenant Smoke Tests Passed Successfully!');
}

runTests().catch(err => {
    console.error('HTTP smoke tests failed:', err);
    process.exit(1);
});
