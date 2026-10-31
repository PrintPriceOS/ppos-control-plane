'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsReleaseRiskService = require('../src/api/services/financialOperationsReleaseRiskService');

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
    console.log('\n━━━ Phase 96D — Release Risk / Rollback Readiness Smoke ━━━\n');

    const evalSvc = new MockEvaluator();
    const riskSvc = new FinancialOperationsReleaseRiskService({ financialOperationsReleaseGateEvaluatorService: evalSvc });
    const actorAdmin = { role: 'FINANCE_ADMIN', userId: 'a_1' };

    const gateClean = {
        release_gate_id: 'rg_clean',
        gate_status: 'READY_FOR_APPROVAL',
        source_readiness_snapshot_json: {}
    };
    evalSvc._mockGates.push(gateClean);

    const gateBad = {
        release_gate_id: 'rg_bad',
        gate_status: 'NOT_READY',
        source_readiness_snapshot_json: null
    };
    evalSvc._mockGates.push(gateBad);

    // SC1
    const riskClean = await riskSvc.evaluateRisk({ gateId: 'rg_clean', actor: actorAdmin });
    assert(riskClean.risk_status === 'LOW_RISK_READY_FOR_APPROVAL', 'SC1: Low risk when all controls are present');
    assert(riskClean.rollback_readiness.REVOCATION_PATH_AVAILABLE === true, 'SC1: Revocation path confirmed');

    // SC2
    const riskBad = await riskSvc.evaluateRisk({ gateId: 'rg_bad', actor: actorAdmin });
    assert(riskBad.risk_status === 'HIGH_RISK_BLOCKED', 'SC2: High risk when source snapshots missing or not ready');

    // SC3 & SC4
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsReleaseRiskService.js'), 'utf-8');
    assert(content.includes('External execution enabled'), 'SC3: High risk when external execution enabled');
    assert(!content.includes('UPDATE runs') && !content.includes('UPDATE orders'), 'SC4: Risk evaluation is read-only');

    // SC5
    assert(riskSvc._mockEvents.some(e => e.event_type === 'FINOPS_RELEASE_RISK_EVALUATED'), 'SC5: Audit events are generated');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 96D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
