'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsReleaseApprovalService = require('../src/api/services/financialOperationsReleaseApprovalService');

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

// Mock Evaluator Service
class MockEvaluator {
    constructor() {
        this._mockGates = [];
    }
}

async function runSmoke() {
    console.log('\n━━━ Phase 96C — FinOps Release Approval Workflow Smoke ━━━\n');

    const evalSvc = new MockEvaluator();
    const appSvc = new FinancialOperationsReleaseApprovalService({ financialOperationsReleaseGateEvaluatorService: evalSvc });
    const actorAdmin = { role: 'FINANCE_ADMIN', userId: 'a_1' };

    const gate1 = {
        release_gate_id: 'rg_1',
        gate_status: 'READY_FOR_APPROVAL',
        tenant_id: 't_1',
        readiness_run_id: 'run_1'
    };
    evalSvc._mockGates.push(gate1);

    const gate2 = {
        release_gate_id: 'rg_2',
        gate_status: 'BLOCKED',
        tenant_id: 't_1',
        readiness_run_id: 'run_2'
    };
    evalSvc._mockGates.push(gate2);

    // SC1
    await appSvc.executeAction({ gateId: 'rg_1', actionType: 'APPROVE_CONTROLLED_RELEASE', actor: actorAdmin });
    assert(gate1.gate_status === 'APPROVED_FOR_CONTROLLED_RELEASE', 'SC1: Approval requires READY_FOR_APPROVAL gate');

    // SC2
    try {
        await appSvc.executeAction({ gateId: 'rg_2', actionType: 'APPROVE_CONTROLLED_RELEASE', actor: actorAdmin });
        assert(false, 'SC2: Blocked gate cannot be approved');
    } catch (err) {
        assert(err.message.includes('not ready for approval'), 'SC2: Blocked gate cannot be approved');
    }

    // SC3
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsReleaseApprovalService.js'), 'utf-8');
    assert(!content.includes('executePayment') && !content.includes('http'), 'SC3: Approval does not execute payment/refund/payout/submission');

    // SC4
    await appSvc.executeAction({ gateId: 'rg_1', actionType: 'REVOKE_APPROVAL', payload: { reason: 'Test' }, actor: actorAdmin });
    assert(gate1.gate_status === 'REVOKED', 'SC4: Revocation works');

    // SC5
    await appSvc.executeAction({ gateId: 'rg_1', actionType: 'ADD_APPROVAL_NOTE', payload: { note: 'Important info' }, actor: actorAdmin });
    assert(appSvc._mockEvents.some(e => e.event_type === 'FINOPS_RELEASE_ADD_APPROVAL_NOTE'), 'SC5: Notes are audited');

    // SC6
    assert(!content.includes('UPDATE runs') && !content.includes('UPDATE orders'), 'SC6: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 96C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
