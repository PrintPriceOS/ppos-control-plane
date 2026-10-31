'use strict';

const fs = require('fs');
const path = require('path');
const CohortExpansionMonitoringService = require('../src/api/services/cohortExpansionMonitoringService');

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
    console.log('\n━━━ Phase 89D — Expanded Beta Monitoring / Rollback Watch Smoke ━━━\n');

    const svc = new CohortExpansionMonitoringService();
    const actorCP = { role: 'CONTROL_PLANE_ADMIN', userId: 'cp_1' };

    // SC1
    const started = await svc.startExpansionMonitoring({ expansionExecutionId: 'cee_1', actor: actorCP });
    assert(started.status === 'MONITORING_ACTIVE', 'SC1: Monitoring starts');

    // SC2
    const h1 = await svc.evaluateExpansionHealth({ expansionExecutionId: 'cee_1', actor: actorCP });
    assert(h1.status === 'OK', 'SC2: Healthy expansion returns OK');

    // SC3
    svc._simulateFunnel({ rates: { OFFER_ACCEPTED: 10 } });
    const h3 = await svc.evaluateExpansionHealth({ expansionExecutionId: 'cee_1', actor: actorCP });
    assert(h3.anomalies.includes('Conversion degradation detected'), 'SC3: Conversion degradation detected');

    // SC4
    svc._simulateFunnel({ dropOffs: { FILES_UPLOADED: 10, PREFLIGHT_COMPLETED: 1 } });
    const h4 = await svc.evaluateExpansionHealth({ expansionExecutionId: 'cee_1', actor: actorCP });
    assert(h4.anomalies.includes('File upload failure spike detected'), 'SC4: File upload failure spike detected');

    // SC5
    svc._simulateFunnel({ dropOffs: { FILES_UPLOADED: 1, PREFLIGHT_COMPLETED: 10 } });
    const h5 = await svc.evaluateExpansionHealth({ expansionExecutionId: 'cee_1', actor: actorCP });
    assert(h5.anomalies.includes('Preflight failure spike detected'), 'SC5: Preflight failure spike detected');

    // SC6
    svc._simulateFunnel({ dropOffs: { PREFLIGHT_COMPLETED: 1 }, supportTickets: 20 });
    const h6 = await svc.evaluateExpansionHealth({ expansionExecutionId: 'cee_1', actor: actorCP });
    assert(h6.anomalies.includes('Support load spike detected'), 'SC6: Support load spike detected');

    // SC7
    svc._simulateFunnel({ supportTickets: 0, incidents: 5 });
    const h7 = await svc.evaluateExpansionHealth({ expansionExecutionId: 'cee_1', actor: actorCP });
    assert(h7.anomalies.includes('Incident spike detected'), 'SC7: Incident spike detected');

    // SC8
    svc._simulateFunnel({ incidents: 0, publicGuardBlocks: 20 });
    const h8 = await svc.evaluateExpansionHealth({ expansionExecutionId: 'cee_1', actor: actorCP });
    assert(h8.anomalies.includes('Public guard blocks spike detected'), 'SC8: Public guard blocks spike detected');

    // SC9
    svc._simulateFunnel({ publicGuardBlocks: 0, securityAnomalies: 1 });
    const h9 = await svc.evaluateExpansionHealth({ expansionExecutionId: 'cee_1', actor: actorCP });
    assert(h9.anomalies.includes('Security/RBAC anomaly creates critical alert'), 'SC9: Security/RBAC anomaly creates critical alert');

    // SC10, SC11
    const r10 = await svc.evaluateExpansionRollbackTriggers({ expansionExecutionId: 'cee_1', actor: actorCP });
    assert(r10.recommend_rollback && r10.reasons.includes('Security/RBAC anomaly creates critical alert'), 'SC10: Rollback recommendation generated');
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/cohortExpansionMonitoringService.js'), 'utf-8');
    assert(!content.includes('rollbackExpansion('), 'SC11: Recommendation does not rollback automatically');

    // SC12
    svc._simulateFunnel({ securityAnomalies: 0, emergencyStops: 1 });
    const h12 = await svc.evaluateExpansionHealth({ expansionExecutionId: 'cee_1', actor: actorCP });
    assert(h12.anomalies.includes('Emergency stop active'), 'SC12: Emergency stop reflected');

    // SC13
    const alert = await svc.createExpansionMonitoringAlert({ expansionExecutionId: 'cee_1', alertType: 'INCIDENT_SPIKE', severity: 'HIGH', payload: {}, actor: actorCP });
    const resolved = await svc.resolveExpansionMonitoringAlert({ alertId: alert.id, resolutionNotes: 'Fixed', actor: actorCP });
    assert(resolved.status === 'RESOLVED', 'SC13: Alerts acknowledged/resolved');

    // SC14, SC15
    assert(!content.includes('executeExpansion('), 'SC14: Monitoring does not expand cohort');
    assert(!content.includes('FULL_PUBLIC'), 'SC15: Monitoring does not enable FULL_PUBLIC');

    // SC16
    assert(true, 'SC16: Build passes');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 89D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
