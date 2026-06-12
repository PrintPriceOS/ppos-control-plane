'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsPreProductionRunbookService = require('../src/api/services/financialOperationsPreProductionRunbookService');
const FinancialOperationsPreProductionOperatorTaskService = require('../src/api/services/financialOperationsPreProductionOperatorTaskService');

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
    console.log('\n━━━ Phase 111C — Operator Task / Manual Confirmation Service Smoke ━━━\n');

    const rbSvc = new FinancialOperationsPreProductionRunbookService();
    const tskSvc = new FinancialOperationsPreProductionOperatorTaskService(rbSvc);
    const actorAdmin = { role: 'CONTROL_PLANE_ADMIN', userId: 'a_1' };

    const validEvidence = {
        security_guardrails_confirmed: true,
        rollback_path_confirmed: true
    };
    const p1 = await rbSvc.createRunbook({ runbookName: 'RB 1', evidence: validEvidence }, actorAdmin);

    // SC1: Build required operator task groups & tasks
    const res1 = await tskSvc.buildOperatorTasks(p1.pre_production_runbook_id, actorAdmin);
    assert(res1.tasks.length === 15, 'SC1: Build required manual tasks');

    // SC2: Missing security confirmation creates blocker
    const p2 = await rbSvc.createRunbook({ runbookName: 'RB 2', evidence: { security_guardrails_confirmed: false, rollback_path_confirmed: true } }, actorAdmin);
    const res2 = await tskSvc.buildOperatorTasks(p2.pre_production_runbook_id, actorAdmin);
    const secTask = res2.tasks.find(t => t.task_key === 'CONFIRM_SECURITY_GUARDRAILS');
    assert(secTask.task_status === 'BLOCKED', 'SC2: Missing security confirmation creates blocker');

    // SC3: Missing rollback confirmation creates blocker
    const p3 = await rbSvc.createRunbook({ runbookName: 'RB 3', evidence: { security_guardrails_confirmed: true, rollback_path_confirmed: false } }, actorAdmin);
    const res3 = await tskSvc.buildOperatorTasks(p3.pre_production_runbook_id, actorAdmin);
    const rbTask = res3.tasks.find(t => t.task_key === 'CONFIRM_ROLLBACK_PATH');
    assert(rbTask.task_status === 'BLOCKED', 'SC3: Missing rollback confirmation creates blocker');

    // SC4: Confirmed task is audited
    await tskSvc.confirmTask(p1.pre_production_runbook_id, 'CONFIRM_FINAL_REVIEW_MEETING', actorAdmin);
    const evs = tskSvc._mockEvents.filter(e => e.event_type === 'FINOPS_PRE_PRODUCTION_OPERATOR_TASK_CONFIRMED');
    assert(evs.length > 0, 'SC4: Confirmed task is audited');

    // SC5: Task confirmation does not activate production
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPreProductionOperatorTaskService.js'), 'utf-8');
    assert(!sourceStr.includes('activateProduction'), 'SC5: Task confirmation does not activate production');

    // SC6: Task confirmation does not mutate source records
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('DELETE FROM'), 'SC6: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 111C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
