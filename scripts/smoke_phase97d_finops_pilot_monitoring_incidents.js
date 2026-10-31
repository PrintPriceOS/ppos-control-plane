'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsPilotMonitoringService = require('../src/api/services/financialOperationsPilotMonitoringService');

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

class MockRunSvc {
    constructor() { this._mockRuns = []; }
}

async function runSmoke() {
    console.log('\n━━━ Phase 97D — Pilot Monitoring / Incidents Smoke ━━━\n');

    const runSvc = new MockRunSvc();
    const monSvc = new FinancialOperationsPilotMonitoringService({ financialOperationsPilotRunService: runSvc });
    const actorAdmin = { role: 'OPS_ADMIN', userId: 'a_1' };

    const runClean = { pilot_run_id: 'pr_clean', run_status: 'DRY_RUN_COMPLETED', execution_mode: 'DRY_RUN', source_snapshot_json: {} };
    const runMissingAudit = { pilot_run_id: 'pr_audit', run_status: 'DRY_RUN_COMPLETED', execution_mode: 'DRY_RUN', source_snapshot_json: {}, _mock_missing_audit: true };
    const runExtExec = { pilot_run_id: 'pr_ext', run_status: 'DRY_RUN_COMPLETED', execution_mode: 'DRY_RUN', source_snapshot_json: {}, _mock_external_execution_enabled: true };
    const runFullPub = { pilot_run_id: 'pr_pub', run_status: 'DRY_RUN_COMPLETED', execution_mode: 'DRY_RUN', source_snapshot_json: {}, _mock_full_public_enabled: true };

    runSvc._mockRuns.push(runClean, runMissingAudit, runExtExec, runFullPub);

    // SC1
    const monClean = await monSvc.generateMonitoringSummary({ runId: 'pr_clean', actor: actorAdmin });
    assert(monClean.monitoring_status === 'HEALTHY', 'SC1: Healthy pilot runs produce HEALTHY');

    // SC2
    const monAudit = await monSvc.generateMonitoringSummary({ runId: 'pr_audit', actor: actorAdmin });
    assert(monAudit.monitoring_status === 'INCIDENT_REVIEW_REQUIRED', 'SC2: Missing audit event triggers incident');

    // SC3
    const monExt = await monSvc.generateMonitoringSummary({ runId: 'pr_ext', actor: actorAdmin });
    assert(monExt.monitoring_status === 'PILOT_SUSPENSION_RECOMMENDED', 'SC3: Attempted external execution flag triggers suspension recommendation');

    // SC4
    const monPub = await monSvc.generateMonitoringSummary({ runId: 'pr_pub', actor: actorAdmin });
    assert(monPub.monitoring_status === 'PILOT_SUSPENSION_RECOMMENDED', 'SC4: FULL_PUBLIC anomaly triggers suspension recommendation');

    // SC5 & SC6
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPilotMonitoringService.js'), 'utf-8');
    assert(!content.includes('UPDATE runs') && !content.includes('UPDATE orders'), 'SC5: Monitoring is read-only');
    assert(monSvc._mockEvents.some(e => e.event_type === 'FINOPS_PILOT_MONITORING_EVALUATED'), 'SC6: Audit events exist');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 97D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
