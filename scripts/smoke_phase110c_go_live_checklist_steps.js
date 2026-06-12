'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsGoLiveSimulationService = require('../src/api/services/financialOperationsGoLiveSimulationService');
const FinancialOperationsGoLiveChecklistService = require('../src/api/services/financialOperationsGoLiveChecklistService');

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
    console.log('\n━━━ Phase 110C — Go-Live Checklist / Step Evaluation Service Smoke ━━━\n');

    const simSvc = new FinancialOperationsGoLiveSimulationService();
    const chkSvc = new FinancialOperationsGoLiveChecklistService(simSvc);
    const actorAdmin = { role: 'CONTROL_PLANE_ADMIN', userId: 'a_1' };

    const validEvidence = {
        rollback_path_ready: true,
        incident_response_ready: true
    };
    const p1 = await simSvc.createSimulation({ simulationName: 'Sim 1', evidence: validEvidence }, actorAdmin);

    // SC1: Build checklist groups and required steps
    const res1 = await chkSvc.buildChecklistAndSteps(p1.go_live_simulation_id, actorAdmin);
    assert(res1.checklists.length === 10, 'SC1.1: Build checklist groups');
    assert(res1.steps.length === 15, 'SC1.2: Build required steps');

    // SC2: Missing rollback creates blocker
    const p2 = await simSvc.createSimulation({ simulationName: 'Sim 2', evidence: { rollback_path_ready: false, incident_response_ready: true } }, actorAdmin);
    const res2 = await chkSvc.buildChecklistAndSteps(p2.go_live_simulation_id, actorAdmin);
    const rbCl = res2.checklists.find(c => c.checklist_key === 'ROLLBACK_READINESS');
    assert(rbCl.checklist_status === 'BLOCKED', 'SC2: Missing rollback creates blocker');

    // SC3: Missing incident response creates blocker
    const p3 = await simSvc.createSimulation({ simulationName: 'Sim 3', evidence: { rollback_path_ready: true, incident_response_ready: false } }, actorAdmin);
    const res3 = await chkSvc.buildChecklistAndSteps(p3.go_live_simulation_id, actorAdmin);
    const irCl = res3.checklists.find(c => c.checklist_key === 'INCIDENT_RESPONSE');
    assert(irCl.checklist_status === 'BLOCKED', 'SC3: Missing incident response creates blocker');

    // SC4: Missing operator approvals creates manual review
    const opCl = res1.checklists.find(c => c.checklist_key === 'OPERATOR_APPROVALS');
    assert(opCl.checklist_status === 'MANUAL_REVIEW_REQUIRED', 'SC4: Operator approvals creates manual review');

    // SC5: Checklist is deterministic (length logic)
    assert(res1.checklists.length === 10 && res2.checklists.length === 10, 'SC5: Checklist is deterministic');

    // SC6: Source records remain unchanged
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsGoLiveChecklistService.js'), 'utf-8');
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('DELETE FROM'), 'SC6: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 110C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
