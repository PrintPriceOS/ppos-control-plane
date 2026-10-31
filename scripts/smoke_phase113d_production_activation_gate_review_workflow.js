'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProductionActivationGateService = require('../src/api/services/financialOperationsProductionActivationGateService');
const FinancialOperationsProductionActivationGateReviewService = require('../src/api/services/financialOperationsProductionActivationGateReviewService');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
    if (condition) { PASS++; console.log(`  ✅  [PASS] ${label}`); }
    else { FAIL++; console.error(`  ❌  [FAIL] ${label}`); }
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 113D — Production Activation Gate Review Workflow Smoke ━━━\n');

    const gateSvc = new FinancialOperationsProductionActivationGateService();
    const revSvc = new FinancialOperationsProductionActivationGateReviewService(gateSvc);
    const actor = { role: 'CONTROL_PLANE_ADMIN', userId: 'a_1' };

    const validEvidence = {
        final_release_candidate_approved: true, approval_chain_present: true,
        compliance_reporting_ready: true, provider_ready: true,
        production_activation_enabled: false, activation_execution_enabled: false,
        full_public_enabled: false, live_provider_connectivity_enabled: false, payment_execution_enabled: false
    };
    const g1 = await gateSvc.createGate({ gateName: 'Gate 1', evidence: validEvidence }, actor);
    await gateSvc.evaluateGate(g1.production_activation_gate_id, actor);

    // SC1: Gate approval does not enable production
    const approved = await revSvc.approveForFutureActivationReview(g1.production_activation_gate_id, actor);
    assert(approved.production_activation_enabled === false, 'SC1.1: production_activation_enabled remains false after approval');
    assert(approved.activation_execution_enabled === false, 'SC1.2: activation_execution_enabled remains false after approval');

    const src = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProductionActivationGateReviewService.js'), 'utf-8');
    assert(!src.includes('activateProduction'), 'SC1.3: Service does not activate production');

    // SC2: Gate approval does not enable FULL_PUBLIC
    assert(!src.includes('enableFullPublic'), 'SC2: Gate approval does not enable FULL_PUBLIC');

    // SC3: Gate approval does not connect providers
    assert(!src.includes('axios') && !src.includes('connect'), 'SC3: Gate approval does not connect providers');

    // SC4: Finding resolution is audited
    await revSvc.resolveFinding(g1.production_activation_gate_id, 'MISSING_APPROVAL', actor);
    assert(revSvc._mockEvents.some(e => e.event_type === 'FINOPS_PRODUCTION_ACTIVATION_GATE_FINDING_RESOLVED'), 'SC4: Finding resolution is audited');

    // SC5: Warning dismissal is audited
    await revSvc.dismissWarning(g1.production_activation_gate_id, 'Stale warning', actor);
    assert(revSvc._mockEvents.some(e => e.event_type === 'FINOPS_PRODUCTION_ACTIVATION_GATE_WARNING_DISMISSED'), 'SC5: Warning dismissal is audited');

    // SC6: Additional evidence request is audited
    await revSvc.requestAdditionalEvidence(g1.production_activation_gate_id, 'Please attach sign-off', actor);
    assert(revSvc._mockEvents.some(e => e.event_type === 'FINOPS_PRODUCTION_ACTIVATION_GATE_REVIEW_ACTION_RECORDED'), 'SC6: Additional evidence request is audited');

    // SC7: Review note is audited
    await revSvc.addReviewNote(g1.production_activation_gate_id, 'SECURITY', 'Security cleared', actor);
    assert(revSvc._mockEvents.some(e => e.event_type === 'FINOPS_PRODUCTION_ACTIVATION_GATE_REVIEW_NOTE_ADDED'), 'SC7: Review note is audited');

    // SC8: Source records remain unchanged
    assert(!src.includes('UPDATE orders') && !src.includes('DELETE FROM'), 'SC8: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 113D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);
    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => { console.error('Smoke crashed:', err); process.exit(1); });
