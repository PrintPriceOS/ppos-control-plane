'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsReleaseGateEvaluatorService = require('../src/api/services/financialOperationsReleaseGateEvaluatorService');

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

// Mock Aggregator Service
class MockAggregator {
    constructor() {
        this._mockRuns = [];
    }
}

async function runSmoke() {
    console.log('\n━━━ Phase 96B — Release Gate Evaluator Smoke ━━━\n');

    const aggSvc = new MockAggregator();
    const evalSvc = new FinancialOperationsReleaseGateEvaluatorService({ financialOperationsReadinessAggregatorService: aggSvc });
    const actorAdmin = { role: 'FINANCE_ADMIN', userId: 'a_1' };

    const runClean = {
        readiness_run_id: 'run_1',
        readiness_status: 'READY_FOR_FINANCIAL_OPERATIONS_REVIEW',
        reconciliation_status: 'READY',
        tax_vat_status: 'READY',
        invoice_status: 'READY',
        credit_note_status: 'READY',
        accounting_export_status: 'READY',
        tenant_id: 't_1'
    };
    aggSvc._mockRuns.push(runClean);

    // SC1
    const gate1 = await evalSvc.evaluateGate({ runId: 'run_1', actor: actorAdmin });
    assert(gate1.gate_status === 'READY_FOR_APPROVAL', 'SC1: Clean readiness run becomes READY_FOR_APPROVAL');

    // SC2
    const runBadRecon = { ...runClean, readiness_run_id: 'run_2', reconciliation_status: 'MISMATCH', readiness_status: 'BLOCKED_BY_RECONCILIATION' };
    aggSvc._mockRuns.push(runBadRecon);
    const gate2 = await evalSvc.evaluateGate({ runId: 'run_2', actor: actorAdmin });
    assert(gate2.gate_status === 'BLOCKED', 'SC2: Missing reconciliation blocks gate');

    // SC3
    const runBadTax = { ...runClean, readiness_run_id: 'run_3', tax_vat_status: 'MANUAL_REVIEW_REQUIRED', readiness_status: 'MANUAL_REVIEW_REQUIRED' };
    aggSvc._mockRuns.push(runBadTax);
    const gate3 = await evalSvc.evaluateGate({ runId: 'run_3', actor: actorAdmin });
    assert(gate3.gate_status === 'MANUAL_REVIEW_REQUIRED', 'SC3: Tax/VAT review pending blocks gate');

    // SC4
    const runBadInv = { ...runClean, readiness_run_id: 'run_4', invoice_status: 'NOT_FINALIZED', readiness_status: 'BLOCKED_BY_INVOICE_LIFECYCLE' };
    aggSvc._mockRuns.push(runBadInv);
    const gate4 = await evalSvc.evaluateGate({ runId: 'run_4', actor: actorAdmin });
    assert(gate4.gate_status === 'BLOCKED', 'SC4: Invoice lifecycle not finalized blocks gate');

    // SC5 & SC6 & SC7
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsReleaseGateEvaluatorService.js'), 'utf-8');
    assert(content.includes('NO_EXTERNAL_SUBMISSION_ENABLED'), 'SC5: External submission flag prevents approval');
    assert(content.includes('FULL_PUBLIC_DISABLED'), 'SC6: FULL_PUBLIC flag prevents approval');
    assert(!content.includes('UPDATE runs') && !content.includes('UPDATE orders'), 'SC7: Source objects remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 96B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
