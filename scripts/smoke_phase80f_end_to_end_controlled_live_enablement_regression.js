'use strict';
/**
 * scripts/smoke_phase80f_end_to_end_controlled_live_enablement_regression.js
 *
 * Phase 80F — End-to-End Controlled Live Enablement Regression.
 */

const fs = require('fs');
const path = require('path');
const LiveProductionEnablementService = require('../src/api/services/liveProductionEnablementService');
const LiveReadinessEvaluationService = require('../src/api/services/liveReadinessEvaluationService');
const LiveApprovalWorkflowService = require('../src/api/services/liveApprovalWorkflowService');
const LiveProductionGuardService = require('../src/api/services/liveProductionGuardService');

let PASS = 0, FAIL = 0;
const assertions = [];

function assert(condition, label) {
    if (condition) {
        PASS++;
        assertions.push({ label, status: 'PASS' });
        console.log(`  ✅  [PASS] ${label}`);
    } else {
        FAIL++;
        assertions.push({ label, status: 'FAIL' });
        console.error(`  ❌  [FAIL] ${label}`);
    }
    return condition;
}

class MockDb {
    constructor() {
        this.records = {
            enablements: {},
            events: [],
            guards: [],
            revocations: []
        };
    }
    async query(sql, params) {
        if (sql.includes('SELECT * FROM live_production_enablements')) {
            const tenantId = params[0];
            const printhouseId = params[1];
            const key = `${tenantId}_${printhouseId}`;
            return this.records.enablements[key] ? [this.records.enablements[key]] : [];
        }
        if (sql.includes('live_production_approval_events')) {
            if (sql.includes('INSERT')) {
                this.records.events.push({ type: params[4], actor: params[6], role: params[7] });
            } else if (sql.includes('SELECT')) {
                return this.records.events.map((e, i) => ({ id: i, event_type: e.type, actor_role: e.role }));
            }
        }
        if (sql.includes('live_production_guard_decisions')) {
            this.records.guards.push({ action: params[6], decision: params[7] });
        }
        if (sql.includes('live_production_revocations')) {
            this.records.revocations.push({ reason: params[5], impactScope: params[6] });
        }
        return [];
    }
}

async function runRegression() {
    console.log('\n━━━ Phase 80F — E2E Controlled Live Regression ━━━\n');

    const db = new MockDb();
    const enablementSvc = new LiveProductionEnablementService(db);
    const readinessSvc = new LiveReadinessEvaluationService();
    const workflowSvc = new LiveApprovalWorkflowService({
        liveProductionEnablementService: enablementSvc,
        liveReadinessEvaluationService: readinessSvc,
        db
    });
    const guardSvc = new LiveProductionGuardService({
        liveProductionEnablementService: enablementSvc,
        db
    });

    const tenantId = 't_e2e';
    const printhouseId = 'ph_e2e';
    const partnerActor = { userId: 'u_partner', role: 'TENANT_ADMIN' };
    const sysActor = { userId: 'u_sys', role: 'SYSTEM_ADMIN' };

    // Hack getLiveEnablement to mutate mock db state since ON DUPLICATE KEY isn't mocked properly
    const originalGet = enablementSvc.getLiveEnablement.bind(enablementSvc);
    enablementSvc.getLiveEnablement = async (params) => {
        const key = `${params.tenantId}_${params.printhouseId}`;
        if (!db.records.enablements[key]) {
            db.records.enablements[key] = enablementSvc._mockDefault(params.tenantId, params.printhouseId);
        }
        return db.records.enablements[key];
    };

    // Override audit to actually save state in mock DB
    const originalAudit = enablementSvc.auditLiveEnablementEvent.bind(enablementSvc);
    enablementSvc.auditLiveEnablementEvent = async (event) => {
        const key = `${event.tenantId}_${event.printhouseId}`;
        if (event.afterJson) {
            db.records.enablements[key] = event.afterJson;
        }
        await originalAudit(event);
    };

    // 1. Initial Guard Check
    let guardResult = await guardSvc.evaluateGuard('CREATE_LIVE_ORDER', { tenantId, printhouseId, actor: partnerActor });
    assert(guardResult.decision === 'BLOCKED', 'R1: Initial guard check blocks all live actions');

    // 2. Request Enablement
    await workflowSvc.submitLiveApprovalRequest({ tenantId, printhouseId, liveScope: 'LIMITED_LIVE', justification: 'E2E Test', actor: partnerActor });
    let state = await enablementSvc.getLiveEnablement({ tenantId, printhouseId });
    assert(state.enablement_status === 'REQUESTED', 'R2: Partner successfully requests enablement');

    // 3. Review Enablement
    await workflowSvc.reviewLiveApprovalRequest({ tenantId, printhouseId, actor: sysActor });
    state = await enablementSvc.getLiveEnablement({ tenantId, printhouseId });
    assert(state.enablement_status === 'UNDER_REVIEW', 'R3: SYSTEM_ADMIN moves to review');

    // 4. Approve Enablement (with passing readiness)
    readinessSvc._mockState = {}; // Pass all
    await workflowSvc.approveLiveApprovalRequest({ tenantId, printhouseId, actor: sysActor, approvalNotes: 'Looks good', approvalPayload: {} });
    state = await enablementSvc.getLiveEnablement({ tenantId, printhouseId });
    assert(state.enablement_status === 'APPROVED', 'R4: SYSTEM_ADMIN approves request');
    assert(state.live_production_enabled === false, 'R5: Approval does NOT activate LIVE automatically');

    // 5. Pre-Activation Guard Check
    guardResult = await guardSvc.evaluateGuard('CREATE_LIVE_ORDER', { tenantId, printhouseId, actor: partnerActor });
    assert(guardResult.decision === 'BLOCKED', 'R6: Pre-activation guard check still blocks');

    // 6. Activate
    await workflowSvc.activateControlledLive({ tenantId, printhouseId, actor: sysActor });
    state = await enablementSvc.getLiveEnablement({ tenantId, printhouseId });
    assert(state.enablement_status === 'ACTIVE' && state.live_production_enabled === true, 'R7: SYSTEM_ADMIN activates LIVE');

    // 7. Post-Activation Guard Check
    guardResult = await guardSvc.evaluateGuard('CREATE_LIVE_ORDER', { tenantId, printhouseId, actor: partnerActor, context: { currentOrdersToday: 0 } });
    assert(guardResult.decision === 'ALLOWED', 'R8: Post-activation guard allows action under scope');

    // 8. Revoke
    await workflowSvc.revokeControlledLive({ tenantId, printhouseId, actor: sysActor, reason: 'E2E Revoke', impactScope: 'FULL_STOP' });
    state = await enablementSvc.getLiveEnablement({ tenantId, printhouseId });
    assert(state.enablement_status === 'REVOKED' && state.live_production_enabled === false, 'R9: SYSTEM_ADMIN revokes LIVE');

    // 9. Post-Revoke Guard Check
    guardResult = await guardSvc.evaluateGuard('CREATE_LIVE_ORDER', { tenantId, printhouseId, actor: partnerActor });
    assert(guardResult.decision === 'BLOCKED', 'R10: Post-revoke guard check blocks all live actions');

    // 10. Audit validation
    assert(db.records.events.length >= 6, 'R11: Full workflow audit trail captured');
    assert(db.records.revocations.length === 1, 'R12: Revocation strictly recorded in impact table');

    // Generate Reports
    const reportDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir);

    const reportData = {
        timestamp: new Date().toISOString(),
        total_assertions: PASS + FAIL,
        passed: PASS,
        failed: FAIL,
        assertions
    };

    fs.writeFileSync(path.join(reportDir, 'phase80f_e2e_live_regression.json'), JSON.stringify(reportData, null, 2));

    const mdReport = `# Phase 80F — E2E Controlled Live Enablement Regression
**Generated:** ${reportData.timestamp}
**Status:** ${FAIL === 0 ? '✅ PASS' : '❌ FAIL'}

## Results
| Assertion | Status |
|---|---|
${assertions.map(a => `| ${a.label} | ${a.status === 'PASS' ? '✅' : '❌'} |`).join('\n')}
`;
    fs.writeFileSync(path.join(reportDir, 'phase80f_e2e_live_regression.md'), mdReport);
    assert(true, 'R13: JSON and Markdown reports generated');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 80F Regression Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runRegression().catch(err => {
    console.error('Regression crashed:', err);
    process.exit(1);
});
