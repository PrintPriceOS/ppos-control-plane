'use strict';

const fs = require('fs');
const path = require('path');
const createPartnerLiveJobsRouter = require('../src/api/routes/partnerLiveJobs');
const PartnerLiveJobService = require('../src/api/services/partnerLiveJobService');

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
    console.log('\n━━━ Phase 83B — Partner Job Board API Smoke ━━━\n');

    // SC1
    const routePath = path.join(ROOT, 'src', 'api', 'routes', 'partnerLiveJobs.js');
    assert(fs.existsSync(routePath), 'SC1: Route file exists');

    const svc = new PartnerLiveJobService({});
    // Setup mock data
    svc._mockDb.jobs.push({ id: 'j_1', tenant_id: 't_A', printhouse_id: 'ph_1' });
    svc._mockDb.jobs.push({ id: 'j_2', tenant_id: 't_A', printhouse_id: 'ph_2' });
    svc._mockDb.jobs.push({ id: 'j_3', tenant_id: 't_B', printhouse_id: 'ph_1' });

    const actorA1 = { tenantId: 't_A', printhouseId: 'ph_1', role: 'PRINTHOUSE_ADMIN' };
    
    // Mock express router usage
    const router = createPartnerLiveJobsRouter({ partnerLiveJobService: svc });
    const routes = {};
    router.stack.forEach(layer => {
        if (layer.route) {
            routes[`${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`] = layer.route.stack[0].handle;
        }
    });

    const invokeRoute = async (method, pathRoute, reqObj) => {
        const handler = routes[`${method} ${pathRoute}`];
        if (!handler) throw new Error('Route not found');
        
        let responseData = null;
        let statusCode = 200;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => { responseData = data; }
        };
        
        await handler(reqObj, res);
        return { status: statusCode, body: responseData };
    };

    // SC2
    let res = await invokeRoute('GET', '/', { actor: actorA1, query: {} });
    assert(res.body.jobs.length === 1 && res.body.jobs[0].id === 'j_1', 'SC2: Partner list returns only scoped jobs');

    // SC3
    res = await invokeRoute('GET', '/:partnerLiveJobId', { actor: actorA1, params: { partnerLiveJobId: 'j_2' }, body: {} });
    assert(res.status === 403, 'SC3: Cross-printhouse access blocked');

    // SC4
    res = await invokeRoute('GET', '/:partnerLiveJobId', { actor: actorA1, params: { partnerLiveJobId: 'j_3' }, body: {} });
    assert(res.status === 403, 'SC4: Cross-tenant access blocked');

    // SC5 & SC6
    res = await invokeRoute('GET', '/:partnerLiveJobId', { actor: actorA1, params: { partnerLiveJobId: 'j_1' }, body: { rawPayload: { governance_snapshot_json: { sec: 1 } } } });
    assert(!res.body.job.governance_snapshot_json, 'SC5: Detail route returns partner-safe payload');
    assert(!res.body.job.raw_billing_data, 'SC6: Detail route hides billing internals');

    // SC7 & SC8
    res = await invokeRoute('GET', '/:partnerLiveJobId/files', { actor: actorA1, params: { partnerLiveJobId: 'j_1' }, body: {} });
    assert(res.body.files[0].url.includes('/api/safe/') && !res.body.files[0].url.includes('/var/www'), 'SC7: Files route hides filesystem paths');
    assert(svc._mockDb.events.find(e => e.eventType === 'PARTNER_FILES_ACCESSED'), 'SC8: File access audit created');

    // SC9, SC10, SC11
    res = await invokeRoute('GET', '/:partnerLiveJobId/timeline', { actor: actorA1, params: { partnerLiveJobId: 'j_1' }, body: {} });
    assert(res.body.timeline[0].safe, 'SC9: Timeline route returns partner-safe events');
    
    res = await invokeRoute('GET', '/:partnerLiveJobId/incidents', { actor: actorA1, params: { partnerLiveJobId: 'j_1' }, body: {} });
    assert(Array.isArray(res.body.incidents), 'SC10: Incidents route returns scoped incidents');
    
    res = await invokeRoute('GET', '/:partnerLiveJobId/allowed-actions', { actor: actorA1, params: { partnerLiveJobId: 'j_1' }, body: {} });
    assert(res.body.allowed_actions.includes('ACCEPT'), 'SC11: Allowed actions route respects live guard');

    // SC12, SC13, SC14
    res = await invokeRoute('POST', '/:partnerLiveJobId/approve-proof', { actor: actorA1, params: { partnerLiveJobId: 'j_1' }, body: {} });
    assert(res.status === 403, 'SC12: Partner route cannot approve proof');
    
    res = await invokeRoute('POST', '/:partnerLiveJobId/approve-payment', { actor: actorA1, params: { partnerLiveJobId: 'j_1' }, body: {} });
    assert(res.status === 403, 'SC13: Partner route cannot approve payment');
    
    res = await invokeRoute('POST', '/:partnerLiveJobId/enable-live', { actor: actorA1, params: { partnerLiveJobId: 'j_1' }, body: {} });
    assert(res.status === 403, 'SC14: Partner route cannot enable live production');

    // SC15, SC16
    assert(res.body.error === 'Partner route cannot enable live production', 'SC15: Error responses sanitized');
    assert(JSON.stringify(res.body).indexOf('guaranteed delivery') === -1, 'SC16: No overclaim wording');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 83B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
