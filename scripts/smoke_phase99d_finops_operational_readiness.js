'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsOperationalReadinessService = require('../src/api/services/financialOperationsOperationalReadinessService');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}`);
    }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 99D — Operational Readiness Smoke ━━━\n');

    const svc = new FinancialOperationsOperationalReadinessService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const readyMetrics = {
        auditTimelineComplete: true,
        monitoringEventsPresent: true,
        incidentResponsePathDefined: true,
        incidentSeverityModelDefined: true,
        rollbackPathDocumented: true,
        revocationPathAvailable: true,
        rateLimitsPresent: true,
        operatorReviewRequired: true,
        exportPreviewOnly: true,
        externalExecutionEnabled: false
    };

    // SC1
    const resReady = await svc.evaluateOperationalReadiness({ metrics: readyMetrics, actor: actorAdmin });
    assert(resReady.status === 'OPERATIONALLY_READY_FOR_REVIEW', 'SC1: Ready when observability, incident response, rollback, monitoring, audit, and rate limits are present');

    // SC2
    const resAudit = await svc.evaluateOperationalReadiness({ metrics: { ...readyMetrics, auditTimelineComplete: false }, actor: actorAdmin });
    assert(resAudit.status === 'BLOCKED_BY_AUDIT_GAPS', 'SC2: Blocked when audit timeline missing');

    // SC3
    const resRollback = await svc.evaluateOperationalReadiness({ metrics: { ...readyMetrics, rollbackPathDocumented: false }, actor: actorAdmin });
    assert(resRollback.status === 'BLOCKED_BY_MISSING_ROLLBACK', 'SC3: Blocked when rollback path missing');

    // SC4
    const resIncident = await svc.evaluateOperationalReadiness({ metrics: { ...readyMetrics, incidentResponsePathDefined: false }, actor: actorAdmin });
    assert(resIncident.status === 'BLOCKED_BY_MISSING_INCIDENT_RESPONSE', 'SC4: Blocked when incident response missing');

    // SC5
    const resMonitor = await svc.evaluateOperationalReadiness({ metrics: { ...readyMetrics, monitoringEventsPresent: false }, actor: actorAdmin });
    assert(resMonitor.status === 'MANUAL_REVIEW_REQUIRED' && resMonitor.warnings.length > 0, 'SC5: Warning when monitoring coverage is partial');

    // SC6 & SC7
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsOperationalReadinessService.js'), 'utf-8');
    assert(!content.includes('UPDATE orders'), 'SC6: Read-only behavior (no source mutation)');
    assert(content.includes('FINOPS_OPERATIONAL_READINESS_EVALUATED'), 'SC7: Audit events exist');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 99D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
