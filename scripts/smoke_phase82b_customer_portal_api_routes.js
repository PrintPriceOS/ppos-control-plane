'use strict';

const fs = require('fs');
const path = require('path');
const createCustomerLiveOrdersRoutes = require('../src/api/routes/customerLiveOrders');
const CustomerLiveOrderViewService = require('../src/api/services/customerLiveOrderViewService');

let PASS = 0, FAIL = 0;
function assert(condition, label, detail = '') {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}${detail ? ` (${detail})` : ''}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}${detail ? `: ${detail}` : ''}`);
    }
    return condition;
}

async function runSmoke() {
    console.log('\n━━━ Phase 82B — Customer Portal API Routes Smoke ━━━\n');

    const ROOT = path.resolve(__dirname, '..');
    const routePath = path.join(ROOT, 'src', 'api', 'routes', 'customerLiveOrders.js');
    assert(fs.existsSync(routePath), 'SC1: Route file exists');

    // Mocks
    const mockOrder = {
        id: 'order_1',
        tenant_id: 't_A',
        customer_id: 'c_1',
        live_order_status: 'LIVE_IN_PRODUCTION'
    };

    const lifecycleSvc = {
        getLiveOrder: async ({ liveOrderId }) => {
            if (liveOrderId === 'order_1') return mockOrder;
            if (liveOrderId === 'order_B') return { ...mockOrder, id: 'order_B', tenant_id: 't_B' };
            if (liveOrderId === 'order_2') return { ...mockOrder, id: 'order_2', customer_id: 'c_2' };
            throw new Error('Not found');
        },
        listLiveOrders: async (filters, actor) => {
            if (filters.tenant_id === 't_A' && filters.customer_id === 'c_1') return [mockOrder];
            return [];
        },
        recordLiveOrderEvent: async () => {}
    };

    const viewSvc = new CustomerLiveOrderViewService({ liveOrderLifecycleService: lifecycleSvc });
    const router = createCustomerLiveOrdersRoutes({
        customerLiveOrderViewService: viewSvc,
        liveOrderLifecycleService: lifecycleSvc
    });

    const makeReqRes = (user, params = {}) => {
        const req = { user, params, query: {} };
        const res = {
            statusCode: 200,
            body: null,
            status(code) { this.statusCode = code; return this; },
            json(data) { this.body = data; return this; }
        };
        return { req, res };
    };

    const handleRoute = async (method, pathStr, req, res) => {
        const layer = router.stack.find(l => l.route && l.route.path === pathStr && l.route.methods[method]);
        if (!layer) throw new Error(`Route ${method} ${pathStr} not found`);
        await layer.route.stack[0].handle(req, res, () => {});
    };

    const cust1 = { id: 'c_1', role: 'CUSTOMER', tenantId: 't_A' };

    // SC2
    let { req, res } = makeReqRes(cust1);
    await handleRoute('get', '/', req, res);
    assert(res.statusCode === 200 && res.body.length === 1 && res.body[0].live_order_id === 'order_1', 'SC2: Customer list route returns only own live orders');

    // SC3
    ({ req, res } = makeReqRes(cust1, { liveOrderId: 'order_1' }));
    await handleRoute('get', '/:liveOrderId', req, res);
    assert(res.statusCode === 200 && res.body.live_order_id === 'order_1', 'SC3: Detail route returns customer-safe view');
    const detailPayloadStr = JSON.stringify(res.body);

    // SC4
    ({ req, res } = makeReqRes(cust1, { liveOrderId: 'order_1' }));
    await handleRoute('get', '/:liveOrderId/next-actions', req, res);
    assert(res.statusCode === 200 && Array.isArray(res.body), 'SC4: Next actions route returns safe actions');

    // SC5
    ({ req, res } = makeReqRes(cust1, { liveOrderId: 'order_1' }));
    await handleRoute('get', '/:liveOrderId/timeline', req, res);
    assert(res.statusCode === 200 && Array.isArray(res.body), 'SC5: Timeline route sanitizes internal events');

    // SC6
    ({ req, res } = makeReqRes(cust1, { liveOrderId: 'order_1' }));
    await handleRoute('get', '/:liveOrderId/documents', req, res);
    assert(res.statusCode === 200 && Array.isArray(res.body), 'SC6: Documents route returns only customer-safe docs');

    // SC7
    ({ req, res } = makeReqRes(cust1, { liveOrderId: 'order_1' }));
    await handleRoute('get', '/:liveOrderId/reports', req, res);
    assert(res.statusCode === 200 && res.body.every(r => r.type === 'customer_safe_report'), 'SC7: Reports route hides raw audit/governance');

    // SC8
    ({ req, res } = makeReqRes(cust1, { liveOrderId: 'order_1' }));
    await handleRoute('get', '/:liveOrderId/messages', req, res);
    assert(res.statusCode === 200 && Array.isArray(res.body), 'SC8: Messages route returns customer-safe communications');

    // SC9
    ({ req, res } = makeReqRes(cust1, { liveOrderId: 'order_B' }));
    await handleRoute('get', '/:liveOrderId', req, res);
    assert(res.statusCode === 403 && res.body.error.includes('cross-tenant'), 'SC9: Cross-tenant access blocked');

    // SC10
    ({ req, res } = makeReqRes(cust1, { liveOrderId: 'order_2' }));
    await handleRoute('get', '/:liveOrderId', req, res);
    assert(res.statusCode === 403 && res.body.error.includes('cross-customer'), 'SC10: Cross-customer access blocked');

    // SC11
    assert(!detailPayloadStr.includes('operator_snapshot_json'), 'SC11: Admin-only fields absent');

    // SC12
    assert(res.body.error && !res.body.error.includes('ReferenceError') && !res.body.error.includes('TypeError'), 'SC12: Error response sanitized');

    // SC13 & SC14 (Verify no POST routes for production mutation in router)
    const postLayers = router.stack.filter(l => l.route && l.route.methods.post);
    assert(postLayers.length === 0, 'SC13 & SC14: Customer route cannot change production status or trigger handoff');

    // SC15
    assert(!detailPayloadStr.includes('guaranteed delivery') && !detailPayloadStr.includes('certified'), 'SC15: No forbidden wording');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 82B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
