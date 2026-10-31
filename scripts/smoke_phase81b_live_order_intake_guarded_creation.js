'use strict';

const fs = require('fs');
const path = require('path');
const createLiveOrderIntakeRoutes = require('../src/api/routes/liveOrderIntake');
const LiveOrderLifecycleService = require('../src/api/services/liveOrderLifecycleService');

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

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 81B — Live Order Intake & Guarded Creation Smoke ━━━\n');

    const routePath = path.join(ROOT, 'src', 'api', 'routes', 'liveOrderIntake.js');
    assert(fs.existsSync(routePath), 'SC1: Route exists');

    // Mocks
    const mockEnablementSvc = {
        getLiveEnablement: async ({ tenantId }) => {
            if (tenantId === 't_active') return { id: 'e1', enablement_status: 'ACTIVE', live_production_enabled: true, live_scope: 'LIMITED_LIVE' };
            if (tenantId === 't_paused') return { id: 'e2', enablement_status: 'PAUSED', live_production_enabled: false };
            if (tenantId === 't_revoked') return { id: 'e3', enablement_status: 'REVOKED', live_production_enabled: false };
            return null;
        }
    };

    const mockCommercialSvc = {
        getTenantBillingStatus: async (t) => t === 't_billing_blocked' ? 'BLOCKED' : 'ACTIVE'
    };

    const mockQuotaSvc = {
        checkQuota: async (t) => t === 't_quota_blocked' ? { status: 'HARD_LIMIT_REACHED' } : { status: 'OK' }
    };

    const mockGuardSvc = {
        evaluateGuard: async (action, ctx) => ctx.tenantId === 't_guard_blocked' ? { decision: 'BLOCKED', reason: 'Guard says no' } : { decision: 'ALLOWED' }
    };

    const lifecycleSvc = new LiveOrderLifecycleService({ liveProductionEnablementService: mockEnablementSvc });

    const routers = createLiveOrderIntakeRoutes({
        liveOrderLifecycleService: lifecycleSvc,
        liveProductionGuardService: mockGuardSvc,
        quotaEnforcementService: mockQuotaSvc,
        commercialPlanService: mockCommercialSvc
    });

    assert(routers.adminRouter && routers.customerRouter, 'SC1.1: Returns separated admin and customer routers');

    const makeReqRes = (body, user) => {
        const req = { body, user, params: {} };
        const res = {
            statusCode: 200,
            body: null,
            status(code) { this.statusCode = code; return this; },
            json(data) { this.body = data; return this; }
        };
        return { req, res };
    };

    // Helper to simulate router handler
    const handleRoute = async (router, method, pathStr, req, res) => {
        const layer = router.stack.find(l => l.route && l.route.path === pathStr && l.route.methods[method]);
        if (!layer) throw new Error(`Route ${method} ${pathStr} not found`);
        await layer.route.stack[0].handle(req, res, () => {});
    };

    // SC2
    let { req, res } = makeReqRes({ tenant_id: 't_active', printhouse_id: 'ph1', live_scope: 'LIMITED_LIVE', order_type: 'BOOK_PRINT' }, { id: 'admin1', role: 'SYSTEM_ADMIN' });
    await handleRoute(routers.adminRouter, 'post', '/', req, res);
    assert(res.statusCode === 201 && res.body.live_order_status === 'LIVE_INTAKE_CREATED', 'SC2: Live order created when enablement active and scope valid');
    const validOrderId = res.body.id;

    // SC3
    ({ req, res } = makeReqRes({ tenant_id: 't_missing', live_scope: 'LIMITED_LIVE' }, { id: 'admin1', role: 'SYSTEM_ADMIN' }));
    await handleRoute(routers.adminRouter, 'post', '/', req, res);
    assert(res.statusCode === 400 && res.body.error.includes('BLOCKED'), 'SC3: Creation blocked when enablement missing');

    // SC4
    ({ req, res } = makeReqRes({ tenant_id: 't_paused', live_scope: 'LIMITED_LIVE' }, { id: 'admin1', role: 'SYSTEM_ADMIN' }));
    await handleRoute(routers.adminRouter, 'post', '/', req, res);
    assert(res.statusCode === 400 && res.body.error.includes('BLOCKED'), 'SC4: Creation blocked when enablement paused');

    // SC5
    ({ req, res } = makeReqRes({ tenant_id: 't_revoked', live_scope: 'LIMITED_LIVE' }, { id: 'admin1', role: 'SYSTEM_ADMIN' }));
    await handleRoute(routers.adminRouter, 'post', '/', req, res);
    assert(res.statusCode === 400 && res.body.error.includes('BLOCKED'), 'SC5: Creation blocked when enablement revoked');

    // SC6 - Out of scope
    ({ req, res } = makeReqRes({ tenant_id: 't_active', live_scope: 'FULL_LIVE' }, { id: 'admin1', role: 'SYSTEM_ADMIN' }));
    await handleRoute(routers.adminRouter, 'post', '/', req, res);
    assert(res.statusCode === 400 && res.body.error.includes('Scope mismatch'), 'SC6: Creation blocked outside allowed order type / scope');

    // SC7
    ({ req, res } = makeReqRes({ tenant_id: 't_quota_blocked', live_scope: 'LIMITED_LIVE' }, { id: 'admin1', role: 'SYSTEM_ADMIN' }));
    await handleRoute(routers.adminRouter, 'post', '/', req, res);
    assert(res.statusCode === 403 && res.body.error.includes('Quota hard limit'), 'SC7: Creation blocked by quota hard limit');

    // SC8
    ({ req, res } = makeReqRes({ tenant_id: 't_billing_blocked', live_scope: 'LIMITED_LIVE' }, { id: 'admin1', role: 'SYSTEM_ADMIN' }));
    await handleRoute(routers.adminRouter, 'post', '/', req, res);
    assert(res.statusCode === 403 && res.body.error.includes('Billing status is BLOCKED'), 'SC8: Creation blocked by billing BLOCKED');

    // SC9
    ({ req, res } = makeReqRes({ tenant_id: 't_active', live_scope: 'LIMITED_LIVE' }, { id: 'cust1', role: 'CUSTOMER', tenantId: 't_other' }));
    await handleRoute(routers.customerRouter, 'post', '/', req, res);
    assert(res.statusCode === 403 && res.body.error.includes('Cross-tenant'), 'SC9: Cross-tenant customer blocked');

    // SC10
    ({ req, res } = makeReqRes({}, { id: 'cust1', role: 'CUSTOMER', tenantId: 't1' }));
    req.params.liveOrderId = validOrderId;
    await handleRoute(routers.customerRouter, 'get', '/:liveOrderId/status', req, res);
    assert(res.statusCode === 200 && res.body._internal === undefined, 'SC10: Customer-safe status hides internals');

    // SC11
    ({ req, res } = makeReqRes({}, { id: 'admin1', role: 'SYSTEM_ADMIN' }));
    req.params.liveOrderId = validOrderId;
    await handleRoute(routers.adminRouter, 'get', '/:liveOrderId/operator-status', req, res);
    assert(res.statusCode === 200 && res.body._internal !== undefined, 'SC11: Operator status shows governance details');

    // SC12
    ({ req, res } = makeReqRes({ reason: 'testing cancel' }, { id: 'admin1', role: 'SYSTEM_ADMIN' }));
    req.params.liveOrderId = validOrderId;
    await handleRoute(routers.adminRouter, 'post', '/:liveOrderId/cancel', req, res);
    assert(res.statusCode === 200 && res.body.live_order_status === 'LIVE_CANCELLED', 'SC12: Cancel live order records event / transitions status');

    // SC13
    const routeContent = fs.readFileSync(routePath, 'utf8');
    assert(!routeContent.includes('MARKETPLACE_LAUNCH'), 'SC13: Intake does not imply public launch');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 81B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
