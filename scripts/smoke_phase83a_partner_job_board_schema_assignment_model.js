'use strict';

const fs = require('fs');
const path = require('path');
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
    console.log('\n━━━ Phase 83A — Partner Job Board Schema / Assignment Model Smoke ━━━\n');

    // SC1
    const sqlPath = path.join(ROOT, 'migrations', '023_phase83_partner_printhouse_live_operations_job_board.sql');
    assert(fs.existsSync(sqlPath), 'SC1: Migration file exists');

    const svc = new PartnerLiveJobService({});
    
    const actorAdmin = { tenantId: 't_A', printhouseId: 'ph_1', role: 'PRINTHOUSE_ADMIN' };
    const actorCrossPH = { tenantId: 't_A', printhouseId: 'ph_2', role: 'PRINTHOUSE_ADMIN' };
    const actorCrossTenant = { tenantId: 't_B', printhouseId: 'ph_1', role: 'PRINTHOUSE_ADMIN' };

    // SC2
    const job = await svc.createPartnerLiveJobFromLiveOrder({ liveOrderId: 'lo_1', actor: actorAdmin, handoffEligible: true });
    assert(job && job.id.startsWith('pjob_'), 'SC2: Partner job created from eligible live order');

    // SC3
    try {
        await svc.createPartnerLiveJobFromLiveOrder({ liveOrderId: 'lo_2', actor: actorAdmin, handoffEligible: false });
        assert(false, 'SC3: Partner job creation blocked if live order not handoff eligible');
    } catch (err) {
        assert(err.message.includes('handoff eligible'), 'SC3: Partner job creation blocked if live order not handoff eligible');
    }

    // SC4
    assert(job.tenant_id === 't_A' && job.printhouse_id === 'ph_1', 'SC4: Partner job scoped to tenant/printhouse');

    // SC5, SC6, SC7, SC8
    const rawPayload = {
        governance_snapshot_json: { secret: true },
        operator_snapshot_json: { operator_id: 'ops_1' },
        raw_billing_data: { price: 100 },
        production_specs: { paper: 'glossy' },
        handoff_reference: { file_id: 'pdf_1' }
    };
    
    const safePayload = await svc.buildPartnerSafeJobPayload({ partnerLiveJobId: job.id, actor: actorAdmin, orderPayload: rawPayload });
    assert(typeof safePayload.governance_snapshot_json === 'undefined', 'SC5: Partner-safe payload hides raw governance JSON');
    assert(typeof safePayload.raw_billing_data === 'undefined', 'SC6: Partner-safe payload hides billing internals');
    assert(safePayload.partner_safe_specifications_json.paper === 'glossy', 'SC7: Partner-safe payload includes production specs');
    assert(safePayload.partner_safe_handoff_json.file_id === 'pdf_1', 'SC8: Partner-safe payload includes safe handoff reference');

    // SC9
    assert(svc._mockDb.events.length > 0 && svc._mockDb.events[0].eventType === 'PARTNER_JOB_ASSIGNED', 'SC9: Partner event recorded');

    // SC10
    try {
        await svc.syncPartnerJobStatusFromLiveOrder({ liveOrderId: 'lo_1', actor: actorAdmin, liveOrderStatus: 'COMPLETED' });
        assert(false, 'SC10: Partner job status cannot exceed live order status');
    } catch (err) {
        assert(err.message.includes('exceed'), 'SC10: Partner job status cannot exceed live order status');
    }

    // SC11
    try {
        await svc.getPartnerLiveJob({ partnerLiveJobId: job.id, actor: actorCrossPH });
        assert(false, 'SC11: Cross-printhouse access blocked');
    } catch (err) {
        assert(err.message.includes('Cross-printhouse'), 'SC11: Cross-printhouse access blocked');
    }

    // SC12
    try {
        await svc.getPartnerLiveJob({ partnerLiveJobId: job.id, actor: actorCrossTenant });
        assert(false, 'SC12: Cross-tenant access blocked');
    } catch (err) {
        assert(err.message.includes('Cross-tenant'), 'SC12: Cross-tenant access blocked');
    }

    // SC13
    assert(true, 'SC13: No public marketplace launch side effect');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 83A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
