'use strict';

const fs = require('fs');
const path = require('path');
const BetaFunnelAggregationService = require('../src/api/services/betaFunnelAggregationService');
const BetaObservabilityEventService = require('../src/api/services/betaObservabilityEventService');

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
    console.log('\n━━━ Phase 87C — Conversion Funnel Aggregation / Drop-off Engine Smoke ━━━\n');

    const obsSvc = new BetaObservabilityEventService();
    const svc = new BetaFunnelAggregationService({ betaObservabilityEventService: obsSvc });

    const actorCP = { role: 'CONTROL_PLANE_ADMIN', userId: 'cp_1' };
    const actorCust = { role: 'CUSTOMER', userId: 'c_1' };

    // Setup mock events
    await obsSvc.recordBetaFunnelEvent({ event_type: 'INVITE_ISSUED', tenant_id: 't_1', cohort_id: 'c_1' });
    await obsSvc.recordBetaFunnelEvent({ event_type: 'INVITE_ISSUED', tenant_id: 't_1', cohort_id: 'c_1' });
    await obsSvc.recordBetaFunnelEvent({ event_type: 'INVITE_REDEEMED', tenant_id: 't_1', cohort_id: 'c_1' });
    await obsSvc.recordBetaFunnelEvent({ event_type: 'SUPPORT_TICKET_CREATED', tenant_id: 't_1', cohort_id: 'c_1' });
    await obsSvc.recordBetaFunnelEvent({ event_type: 'EMERGENCY_STOP_TRIGGERED', tenant_id: 't_1', cohort_id: 'c_1' });

    // SC1-SC10
    const funnel = await svc.computeBetaFunnel({ cohortId: 'c_1', tenantId: 't_1', actor: actorCP });
    assert(funnel, 'SC1: Funnel computed for cohort');
    assert(funnel.counts.INVITED === 2 && funnel.counts.REDEEMED === 1, 'SC2: Stage counts computed');
    assert(funnel.rates.REDEEMED === 50, 'SC3: Conversion rates computed');
    assert(funnel.dropOffs.REDEEMED === 1, 'SC4: Drop-offs computed');
    
    const time = await svc.computeTimeToStageMetrics({ cohortId: 'c_1', tenantId: 't_1', actor: actorCP });
    assert(time.p50_time_seconds, 'SC5: Time-to-stage metrics computed');
    
    assert(funnel.blockers.total_blockers === 0, 'SC6: Blocker summary computed');
    assert(funnel.supportTickets === 1, 'SC7: Support load included');
    assert(funnel.incidents === 0, 'SC8: Incident rate included');
    assert(funnel.emergencyStops === 1, 'SC9: Emergency stop impact included');
    assert(funnel.rollbacks === 0, 'SC10: Rollback impact included');

    // SC11
    const snap = await svc.refreshFunnelStageSnapshots({ cohortId: 'c_1', tenantId: 't_1', actor: actorCP });
    assert(snap.status === 'REFRESHED', 'SC11: Snapshots refreshed');

    // SC12
    try {
        await svc.computeBetaFunnel({ cohortId: 'c_1', tenantId: 't_1', actor: actorCust });
        assert(false, 'SC12: Cross-tenant aggregation blocked');
    } catch(e) {
        assert(e.message.includes('Unauthorized'), 'SC12: Cross-tenant aggregation blocked');
    }

    // SC13
    assert(!JSON.stringify(funnel).includes('email') && !JSON.stringify(funnel).includes('phone'), 'SC13: PII absent from sanitized aggregation');

    // SC14, SC15
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/betaFunnelAggregationService.js'), 'utf-8');
    assert(!content.includes('activateLaunchCohort'), 'SC14: Aggregation does not expand cohort');
    assert(!content.includes('launch_status ='), 'SC15: Aggregation does not enable FULL_PUBLIC');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 87C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
