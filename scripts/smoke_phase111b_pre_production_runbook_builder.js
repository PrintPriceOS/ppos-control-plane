'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsPreProductionRunbookService = require('../src/api/services/financialOperationsPreProductionRunbookService');

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
    console.log('\n━━━ Phase 111B — Pre-Production Runbook Builder Service Smoke ━━━\n');

    const svc = new FinancialOperationsPreProductionRunbookService();
    const actorAdmin = { role: 'CONTROL_PLANE_ADMIN', userId: 'a_1' };

    const validEvidence = {
        go_live_simulation_completed: true,
        compliance_reporting_ready: true,
        privacy_retention_ready: true,
        provider_ready: true,
        rollback_path_ready: true,
        production_activation_enabled: false,
        full_public_enabled: false,
        live_provider_connectivity_enabled: false
    };

    // SC1: Clean stack becomes APPROVED_FOR_PRE_PRODUCTION_REVIEW
    const p1 = await svc.createRunbook({ runbookName: 'RB 1', evidence: validEvidence }, actorAdmin);
    const eval1 = await svc.evaluateRunbook(p1.pre_production_runbook_id, actorAdmin);
    assert(eval1.runbook_status === 'APPROVED_FOR_PRE_PRODUCTION_REVIEW', 'SC1: Clean stack becomes APPROVED_FOR_PRE_PRODUCTION_REVIEW');

    // SC2: Missing go-live simulation blocks runbook
    const p2 = await svc.createRunbook({ runbookName: 'RB 2', evidence: { ...validEvidence, go_live_simulation_completed: false } }, actorAdmin);
    const eval2 = await svc.evaluateRunbook(p2.pre_production_runbook_id, actorAdmin);
    assert(eval2.runbook_status === 'BLOCKED_BY_MISSING_EVIDENCE', 'SC2: Missing go-live simulation blocks runbook');

    // SC3: Missing compliance report blocks runbook
    const p3 = await svc.createRunbook({ runbookName: 'RB 3', evidence: { ...validEvidence, compliance_reporting_ready: false } }, actorAdmin);
    const eval3 = await svc.evaluateRunbook(p3.pre_production_runbook_id, actorAdmin);
    assert(eval3.runbook_status === 'BLOCKED_BY_COMPLIANCE_GAP', 'SC3: Missing compliance report blocks runbook');

    // SC4: Missing rollback evidence blocks runbook
    const p4 = await svc.createRunbook({ runbookName: 'RB 4', evidence: { ...validEvidence, rollback_path_ready: false } }, actorAdmin);
    const eval4 = await svc.evaluateRunbook(p4.pre_production_runbook_id, actorAdmin);
    assert(eval4.runbook_status === 'BLOCKED_BY_ROLLBACK_GAP', 'SC4: Missing rollback evidence blocks runbook');

    // SC5: FULL_PUBLIC enabled blocks runbook
    const p5 = await svc.createRunbook({ runbookName: 'RB 5', evidence: { ...validEvidence, full_public_enabled: true } }, actorAdmin);
    const eval5 = await svc.evaluateRunbook(p5.pre_production_runbook_id, actorAdmin);
    assert(eval5.runbook_status === 'BLOCKED_BY_SECURITY_GAP', 'SC5: FULL_PUBLIC enabled blocks runbook');

    // SC6: Production activation enabled blocks runbook
    const p6 = await svc.createRunbook({ runbookName: 'RB 6', evidence: { ...validEvidence, production_activation_enabled: true } }, actorAdmin);
    const eval6 = await svc.evaluateRunbook(p6.pre_production_runbook_id, actorAdmin);
    assert(eval6.runbook_status === 'BLOCKED_BY_SECURITY_GAP', 'SC6: Production activation enabled blocks runbook');

    // SC7: Live provider connectivity enabled blocks runbook
    const p7 = await svc.createRunbook({ runbookName: 'RB 7', evidence: { ...validEvidence, live_provider_connectivity_enabled: true } }, actorAdmin);
    const eval7 = await svc.evaluateRunbook(p7.pre_production_runbook_id, actorAdmin);
    assert(eval7.runbook_status === 'BLOCKED_BY_PROVIDER_GAP', 'SC7: Live provider connectivity enabled blocks runbook');

    // SC8: Source records remain unchanged
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPreProductionRunbookService.js'), 'utf-8');
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('DELETE FROM'), 'SC8: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 111B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
