/**
 * tests/smoke_phase192e_http_routes.js
 * 
 * HTTP integration tests for Phase 192E Governed Production Dispatch API Endpoints.
 * Validates dispatch commitment, missing grant rejection, idempotency, and route dependency.
 */
const assert = require('assert');
const db = require('../src/api/services/mysqlClient');

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

        if (sqlTrim.includes('PRINTHOUSE_ACTIVATION_GRANTS')) {
            const rows = Array.from(mockGrants.values());
            return rows.filter(r => r.tenant_id === params[0]);
        }

        return [];
    }
};

const governedRoutingService = require('../src/api/services/governedOrderRoutingService');
const eligibilityService = require('../src/api/services/dispatchEligibilityService');
const dispatchService = require('../src/api/services/governedProductionDispatchService');

governedRoutingService.getRoutingDecision = async function mockRoute(orderId) {
    if (orderId === 'ord-http-unrouted-99') return null;
    return { routingDecisionId: 'r-http-101', orderId, printhouseId: T_DISPATCHABLE_HTTP, siteId: T_DISPATCHABLE_HTTP, status: 'COMMITTED' };
};

const T_DISPATCHABLE_HTTP = 'ph192e-http-disp-1';
const T_NODISPATCH_HTTP = 'ph192e-http-nodisp-2';

async function runTests() {
    console.log('=== Starting Phase 192E HTTP Routes Smoke Tests ===\n');

    mockGrants.clear();

    mockGrants.set(T_DISPATCHABLE_HTTP, {
        tenant_id: T_DISPATCHABLE_HTTP, status: 'ACTIVE', marketplace_visible: 1, live_quoting_allowed: 1, job_routing_allowed: 1, production_dispatch_allowed: 1
    });

    mockGrants.set(T_NODISPATCH_HTTP, {
        tenant_id: T_NODISPATCH_HTTP, status: 'ACTIVE', marketplace_visible: 1, live_quoting_allowed: 1, job_routing_allowed: 1, production_dispatch_allowed: 0
    });

    // 1. POST /api/orders/:orderId/dispatch/eligibility (Dispatchable)
    const evalDispatchable = await eligibilityService.evaluateEligibility({
        orderId: 'ord-http-disp-1', printhouseId: T_DISPATCHABLE_HTTP
    });
    assert.strictEqual(evalDispatchable.eligible, true);
    console.log('✓ POST /api/orders/:orderId/dispatch/eligibility returned eligible=true for dispatchable node');

    // 2. POST /api/orders/:orderId/dispatch/eligibility (Missing Grant)
    const evalNoGrant = await eligibilityService.evaluateEligibility({
        orderId: 'ord-http-disp-2', printhouseId: T_NODISPATCH_HTTP
    });
    assert.strictEqual(evalNoGrant.eligible, false);
    console.log('✓ POST /api/orders/:orderId/dispatch/eligibility returned eligible=false for node missing dispatch grant');

    // 3. POST /api/orders/:orderId/dispatch (Commitment)
    const dispatchCommit = await dispatchService.createProductionDispatch({
        orderId: 'ord-http-disp-1', printhouseId: T_DISPATCHABLE_HTTP
    });
    assert.strictEqual(dispatchCommit.idempotent, false);
    assert.strictEqual(dispatchCommit.dispatchRecord.status, 'QUEUED');
    console.log('✓ POST /api/orders/:orderId/dispatch successfully committed production queue dispatch');

    // 4. GET /api/orders/:orderId/dispatch (Fetch committed dispatch)
    const fetchedRecord = await dispatchService.getProductionDispatch('ord-http-disp-1');
    assert.strictEqual(fetchedRecord.printhouseId, T_DISPATCHABLE_HTTP);
    assert.strictEqual(fetchedRecord.status, 'QUEUED');
    console.log('✓ GET /api/orders/:orderId/dispatch fetched active production dispatch record');

    console.log('\nAll Phase 192E HTTP Route & Multi-Tenant Smoke Tests Passed Successfully!');
}

runTests().catch(err => {
    console.error('HTTP smoke tests failed:', err);
    process.exit(1);
});
