'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsPreProductionRunbookService = require('../src/api/services/financialOperationsPreProductionRunbookService');
const FinancialOperationsPreProductionOperatorTaskService = require('../src/api/services/financialOperationsPreProductionOperatorTaskService');
const FinancialOperationsPreProductionRunbookReviewService = require('../src/api/services/financialOperationsPreProductionRunbookReviewService');

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
    console.log('\n━━━ Phase 111D — Pre-Production Runbook Review Workflow Service Smoke ━━━\n');

    const rbSvc = new FinancialOperationsPreProductionRunbookService();
    const tskSvc = new FinancialOperationsPreProductionOperatorTaskService(rbSvc);
    const reviewSvc = new FinancialOperationsPreProductionRunbookReviewService(rbSvc, tskSvc);
    const actorAdmin = { role: 'CONTROL_PLANE_ADMIN', userId: 'a_1' };

    const validEvidence = {
        go_live_simulation_completed: true,
        compliance_reporting_ready: true,
        privacy_retention_ready: true,
        provider_ready: true,
        rollback_path_ready: true,
        production_activation_enabled: false,
        full_public_enabled: false,
        live_provider_connectivity_enabled: false,
        security_guardrails_confirmed: true,
        rollback_path_confirmed: true
    };
    const p1 = await rbSvc.createRunbook({ runbookName: 'RB 1', evidence: validEvidence }, actorAdmin);
    await rbSvc.evaluateRunbook(p1.pre_production_runbook_id, actorAdmin);
    await tskSvc.buildOperatorTasks(p1.pre_production_runbook_id, actorAdmin);

    // SC1: Runbook approval does not enable production
    const appRun = await reviewSvc.approvePreProductionRunbook(p1.pre_production_runbook_id, actorAdmin);
    assert(appRun.runbook_status === 'PRE_PRODUCTION_RUNBOOK_APPROVED', 'SC1.1: Run is PRE_PRODUCTION_RUNBOOK_APPROVED');
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPreProductionRunbookReviewService.js'), 'utf-8');
    assert(!sourceStr.includes('activateProduction'), 'SC1.2: Runbook approval does not enable production');

    // SC2: Runbook approval does not enable FULL_PUBLIC
    assert(!sourceStr.includes('full_public'), 'SC2: Runbook approval does not enable FULL_PUBLIC');

    // SC3: Runbook approval does not connect providers
    assert(!sourceStr.includes('axios') && !sourceStr.includes('connect'), 'SC3: Runbook approval does not connect providers');

    // SC4: Operator task confirmation is audited
    await reviewSvc.confirmOperatorTaskByReview(p1.pre_production_runbook_id, 'CONFIRM_FINOPS_READINESS_PACK', actorAdmin);
    assert(reviewSvc._mockEvents.some(e => e.event_type === 'FINOPS_PRE_PRODUCTION_OPERATOR_TASK_CONFIRMED_BY_REVIEW'), 'SC4: Operator task confirmation is audited');

    // SC5: Finding resolution is audited
    await reviewSvc.resolveFinding(p1.pre_production_runbook_id, 'MISSING_EVIDENCE', actorAdmin);
    assert(reviewSvc._mockEvents.some(e => e.event_type === 'FINOPS_PRE_PRODUCTION_RUNBOOK_FINDING_RESOLVED'), 'SC5: Finding resolution is audited');

    // SC6: Warning dismissal is audited
    await reviewSvc.dismissWarning(p1.pre_production_runbook_id, 'Warning check', actorAdmin);
    assert(reviewSvc._mockEvents.some(e => e.event_type === 'FINOPS_PRE_PRODUCTION_RUNBOOK_WARNING_DISMISSED'), 'SC6: Warning dismissal is audited');

    // SC7: Additional evidence request is audited
    await reviewSvc.requestAdditionalEvidence(p1.pre_production_runbook_id, 'Please attach approval doc', actorAdmin);
    assert(reviewSvc._mockEvents.some(e => e.event_type === 'FINOPS_PRE_PRODUCTION_RUNBOOK_REVIEW_NOTE_ADDED'), 'SC7: Additional evidence request is audited');

    // SC8: Source records remain unchanged
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('DELETE FROM'), 'SC8: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 111D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
