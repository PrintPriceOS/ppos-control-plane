'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsPilotRunService = require('../src/api/services/financialOperationsPilotRunService');

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

// Mocks
class MockProgramSvc {
    constructor() { this._mockPrograms = []; }
}
class MockEvalSvc {
    constructor() { this._mockGates = []; }
}

async function runSmoke() {
    console.log('\n━━━ Phase 97C — Pilot Run Dry-Run Smoke ━━━\n');

    const progSvc = new MockProgramSvc();
    const evalSvc = new MockEvalSvc();
    const runSvc = new FinancialOperationsPilotRunService({ 
        financialOperationsPilotProgramService: progSvc,
        financialOperationsReleaseGateEvaluatorService: evalSvc 
    });
    
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    // Setup mocks
    const gate1 = { release_gate_id: 'rg_1', gate_status: 'APPROVED_FOR_CONTROLLED_RELEASE' };
    const gate2 = { release_gate_id: 'rg_2', gate_status: 'BLOCKED' };
    evalSvc._mockGates.push(gate1, gate2);

    const prog1 = { pilot_program_id: 'pp_1', program_status: 'ACTIVE_CONTROLLED_PILOT', allowed_operation_types_json: ['PAYMENT_DRY_RUN'] };
    progSvc._mockPrograms.push(prog1);

    // SC1
    const run1 = await runSvc.createRun({ gateId: 'rg_1', programId: 'pp_1', operationType: 'PAYMENT_DRY_RUN', actor: actorAdmin });
    assert(run1.run_status === 'CREATED', 'SC1: Approved Phase 96 gate creates dry-run pilot run');
    assert(run1.execution_mode === 'DRY_RUN', 'SC1: Execution mode strictly DRY_RUN');

    // SC2
    try {
        await runSvc.createRun({ gateId: 'rg_2', programId: 'pp_1', operationType: 'PAYMENT_DRY_RUN', actor: actorAdmin });
        assert(false, 'SC2: Unapproved gate blocks pilot run');
    } catch (err) {
        assert(err.message.includes('must be approved'), 'SC2: Unapproved gate blocks pilot run');
    }

    // SC3
    try {
        await runSvc.createRun({ gateId: 'rg_1', programId: 'pp_1', operationType: 'REFUND_DRY_RUN', actor: actorAdmin });
        assert(false, 'SC3: Operation outside pilot allowlist blocks run');
    } catch (err) {
        assert(err.message.includes('not allowed'), 'SC3: Operation outside pilot allowlist blocks run');
    }

    // SC4
    await runSvc.evaluateEligibility({ runId: run1.pilot_run_id, actor: actorAdmin });
    const compRun = await runSvc.executeDryRun({ runId: run1.pilot_run_id, actor: actorAdmin });
    assert(compRun.run_status === 'DRY_RUN_COMPLETED', 'SC4: DRY_RUN produces result snapshot');
    assert(compRun.result_snapshot_json !== null, 'SC4: Result snapshot exists');

    // SC5 & SC6
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPilotRunService.js'), 'utf-8');
    assert(!content.includes('http') && !content.includes('axios'), 'SC5: No external API call exists');
    assert(!content.includes('UPDATE runs') && !content.includes('UPDATE orders'), 'SC6: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 97C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
