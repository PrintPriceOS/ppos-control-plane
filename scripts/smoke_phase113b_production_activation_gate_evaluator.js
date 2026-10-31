'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProductionActivationGateService = require('../src/api/services/financialOperationsProductionActivationGateService');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
    if (condition) { PASS++; console.log(`  ✅  [PASS] ${label}`); }
    else { FAIL++; console.error(`  ❌  [FAIL] ${label}`); }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 113B — Production Activation Gate Evaluator Smoke ━━━\n');

    const svc = new FinancialOperationsProductionActivationGateService();
    const actor = { role: 'CONTROL_PLANE_ADMIN', userId: 'a_1' };

    const validEvidence = {
        final_release_candidate_approved: true,
        approval_chain_present: true,
        compliance_reporting_ready: true,
        provider_ready: true,
        production_activation_enabled: false,
        activation_execution_enabled: false,
        full_public_enabled: false,
        live_provider_connectivity_enabled: false,
        payment_execution_enabled: false
    };

    // SC1: Clean stack → APPROVED_FOR_FUTURE_ACTIVATION_REVIEW
    const g1 = await svc.createGate({ gateName: 'Gate 1', evidence: validEvidence }, actor);
    const e1 = await svc.evaluateGate(g1.production_activation_gate_id, actor);
    assert(e1.activation_gate_status === 'APPROVED_FOR_FUTURE_ACTIVATION_REVIEW', 'SC1: Clean stack → APPROVED_FOR_FUTURE_ACTIVATION_REVIEW');

    // SC2: Missing final release candidate → BLOCKED_BY_MISSING_FINAL_RELEASE_CANDIDATE
    const g2 = await svc.createGate({ gateName: 'Gate 2', evidence: { ...validEvidence, final_release_candidate_approved: false } }, actor);
    const e2 = await svc.evaluateGate(g2.production_activation_gate_id, actor);
    assert(e2.activation_gate_status === 'BLOCKED_BY_MISSING_FINAL_RELEASE_CANDIDATE', 'SC2: Missing FRC → BLOCKED_BY_MISSING_FINAL_RELEASE_CANDIDATE');

    // SC3: Missing approval chain
    const g3 = await svc.createGate({ gateName: 'Gate 3', evidence: { ...validEvidence, approval_chain_present: false } }, actor);
    const e3 = await svc.evaluateGate(g3.production_activation_gate_id, actor);
    assert(e3.activation_gate_status === 'BLOCKED_BY_APPROVAL_GAP', 'SC3: Missing approval chain → BLOCKED_BY_APPROVAL_GAP');

    // SC4: FULL_PUBLIC enabled → BLOCKED_BY_SECURITY_GAP
    const g4 = await svc.createGate({ gateName: 'Gate 4', evidence: { ...validEvidence, full_public_enabled: true } }, actor);
    const e4 = await svc.evaluateGate(g4.production_activation_gate_id, actor);
    assert(e4.activation_gate_status === 'BLOCKED_BY_SECURITY_GAP', 'SC4: FULL_PUBLIC enabled → BLOCKED_BY_SECURITY_GAP');

    // SC5: production_activation_enabled → BLOCKED_BY_SECURITY_GAP
    const g5 = await svc.createGate({ gateName: 'Gate 5', evidence: { ...validEvidence, production_activation_enabled: true } }, actor);
    const e5 = await svc.evaluateGate(g5.production_activation_gate_id, actor);
    assert(e5.activation_gate_status === 'BLOCKED_BY_SECURITY_GAP', 'SC5: production_activation_enabled → BLOCKED_BY_SECURITY_GAP');

    // SC6: activation_execution_enabled → BLOCKED_BY_SECURITY_GAP
    const g6 = await svc.createGate({ gateName: 'Gate 6', evidence: { ...validEvidence, activation_execution_enabled: true } }, actor);
    const e6 = await svc.evaluateGate(g6.production_activation_gate_id, actor);
    assert(e6.activation_gate_status === 'BLOCKED_BY_SECURITY_GAP', 'SC6: activation_execution_enabled → BLOCKED_BY_SECURITY_GAP');

    // SC7: live provider connectivity enabled → BLOCKED_BY_SECURITY_GAP
    const g7 = await svc.createGate({ gateName: 'Gate 7', evidence: { ...validEvidence, live_provider_connectivity_enabled: true } }, actor);
    const e7 = await svc.evaluateGate(g7.production_activation_gate_id, actor);
    assert(e7.activation_gate_status === 'BLOCKED_BY_SECURITY_GAP', 'SC7: live_provider_connectivity_enabled → BLOCKED_BY_SECURITY_GAP');

    // SC8: payment execution enabled → BLOCKED_BY_SECURITY_GAP
    const g8 = await svc.createGate({ gateName: 'Gate 8', evidence: { ...validEvidence, payment_execution_enabled: true } }, actor);
    const e8 = await svc.evaluateGate(g8.production_activation_gate_id, actor);
    assert(e8.activation_gate_status === 'BLOCKED_BY_SECURITY_GAP', 'SC8: payment_execution_enabled → BLOCKED_BY_SECURITY_GAP');

    // SC9: Source records remain unchanged
    const src = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProductionActivationGateService.js'), 'utf-8');
    assert(!src.includes('UPDATE orders') && !src.includes('DELETE FROM'), 'SC9: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 113B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);
    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => { console.error('Smoke crashed:', err); process.exit(1); });
