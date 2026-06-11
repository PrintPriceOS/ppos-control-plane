'use strict';

const fs = require('fs');
const path = require('path');
const BetaHealthAlertService = require('../src/api/services/betaHealthAlertService');

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
    console.log('\n━━━ Phase 87D — Beta Health Alerts / Risk Detection Smoke ━━━\n');

    // Mock aggregation
    const mockFunnel = {
        counts: { REDEEMED: 10, OFFER_GENERATED: 20 },
        rates: { REGISTERED: 40, OFFER_ACCEPTED: 10 },
        dropOffs: { FILES_UPLOADED: 6, PREFLIGHT_COMPLETED: 6, PROOF_APPROVED: 6, PAYMENT_CONFIRMED: 6, LIVE_PIPELINE_ENTERED: 3 },
        supportTickets: 11,
        incidents: 3,
        emergencyStops: 1,
        rollbacks: 0
    };

    const mockAggSvc = {
        computeBetaFunnel: async () => mockFunnel
    };

    const svc = new BetaHealthAlertService({ betaFunnelAggregationService: mockAggSvc });
    const actorCP = { role: 'CONTROL_PLANE_ADMIN', userId: 'cp_1' };

    // SC1
    const healthyFunnel = { counts: { REDEEMED: 0, OFFER_GENERATED: 0 }, rates: { REGISTERED: 100, OFFER_ACCEPTED: 100 }, dropOffs: {}, supportTickets: 0, incidents: 0, emergencyStops: 0, rollbacks: 0 };
    const mockAggSvcHealthy = { computeBetaFunnel: async () => healthyFunnel };
    const svcHealthy = new BetaHealthAlertService({ betaFunnelAggregationService: mockAggSvcHealthy });
    await svcHealthy.evaluateBetaHealth({ cohortId: 'c_1', tenantId: 't_1', actor: actorCP });
    assert(svcHealthy._mockAlerts.length === 0, 'SC1: Health evaluation returns OK when metrics healthy');

    // Trigger all alerts
    await svc.evaluateBetaHealth({ cohortId: 'c_1', tenantId: 't_1', actor: actorCP });

    // SC2-SC10
    const alertTypes = svc._mockAlerts.map(a => a.alert_type);
    assert(alertTypes.includes('REGISTRATION_DROP_OFF_HIGH'), 'SC2: Registration drop-off alert created');
    assert(alertTypes.includes('OFFER_CONVERSION_LOW'), 'SC3: Offer conversion alert created');
    assert(alertTypes.includes('FILE_UPLOAD_FAILURE_SPIKE'), 'SC4: File upload failure alert created');
    assert(alertTypes.includes('PREFLIGHT_FAILURE_SPIKE'), 'SC5: Preflight failure alert created');
    assert(alertTypes.includes('PROOF_PAYMENT_STALLED'), 'SC6: Proof/payment stall alert created');
    assert(alertTypes.includes('LIVE_PIPELINE_BLOCKED'), 'SC7: Live pipeline blocked alert created');
    assert(alertTypes.includes('SUPPORT_LOAD_HIGH'), 'SC8: Support load alert created');
    assert(alertTypes.includes('INCIDENT_RATE_HIGH'), 'SC9: Incident rate alert created');
    assert(alertTypes.includes('EMERGENCY_STOP_ACTIVE'), 'SC10: Emergency stop alert created');

    // SC11, SC12, SC13
    const a1 = svc._mockAlerts[0];
    const a2 = svc._mockAlerts[1];
    const a3 = svc._mockAlerts[2];

    await svc.acknowledgeBetaAlert({ alertId: a1.id, actor: actorCP });
    assert(a1.alert_status === 'ACKNOWLEDGED', 'SC11: Alert acknowledged');

    await svc.resolveBetaAlert({ alertId: a2.id, resolutionNotes: 'fixed', actor: actorCP });
    assert(a2.alert_status === 'RESOLVED', 'SC12: Alert resolved');

    await svc.dismissBetaAlert({ alertId: a3.id, reason: 'noise', actor: actorCP });
    assert(a3.alert_status === 'DISMISSED', 'SC13: Alert dismissed');

    // SC14, SC15, SC16
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/betaHealthAlertService.js'), 'utf-8');
    assert(!content.includes('launch_status ='), 'SC14: Alerts do not mutate launch state');
    assert(!content.includes('emergency_stop_active ='), 'SC15: Alerts do not trigger emergency stop');
    assert(!content.includes('FULL_PUBLIC'), 'SC16: Alerts do not enable FULL_PUBLIC');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 87D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
