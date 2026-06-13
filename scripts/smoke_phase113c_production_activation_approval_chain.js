'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProductionActivationGateService = require('../src/api/services/financialOperationsProductionActivationGateService');
const FinancialOperationsProductionActivationApprovalService = require('../src/api/services/financialOperationsProductionActivationApprovalService');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
    if (condition) { PASS++; console.log(`  ✅  [PASS] ${label}`); }
    else { FAIL++; console.error(`  ❌  [FAIL] ${label}`); }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');
const REQUIRED_ROLES = ['EXECUTIVE_APPROVER', 'FINANCE_APPROVER', 'SECURITY_APPROVER', 'OPERATIONS_APPROVER', 'COMPLIANCE_APPROVER', 'PRIVACY_APPROVER', 'PROVIDER_OPERATIONS_APPROVER'];

async function runSmoke() {
    console.log('\n━━━ Phase 113C — Manual Approval Chain Smoke ━━━\n');

    const gateSvc = new FinancialOperationsProductionActivationGateService();
    const apSvc = new FinancialOperationsProductionActivationApprovalService(gateSvc);
    const actor = { role: 'CONTROL_PLANE_ADMIN', userId: 'a_1' };

    const validEvidence = {
        final_release_candidate_approved: true, approval_chain_present: true,
        compliance_reporting_ready: true, provider_ready: true,
        production_activation_enabled: false, activation_execution_enabled: false,
        full_public_enabled: false, live_provider_connectivity_enabled: false, payment_execution_enabled: false
    };
    const g1 = await gateSvc.createGate({ gateName: 'Gate 1', evidence: validEvidence }, actor);

    // SC1: Build required approval chain
    const chain = await apSvc.buildApprovalChain(g1.production_activation_gate_id, actor);
    assert(chain.approvals.length === 7, 'SC1: Build required approval chain — 7 roles');

    // SC2: All approvals present allows gate readiness
    for (const role of REQUIRED_ROLES) {
        await apSvc.grantApproval(g1.production_activation_gate_id, role, `ref-${role}`, 'OK', actor);
    }
    const eval1 = apSvc.evaluateChain(g1.production_activation_gate_id);
    assert(eval1.complete === true, 'SC2: All approvals present allows gate readiness');

    // SC3: Missing SECURITY_APPROVER blocks chain
    const g2 = await gateSvc.createGate({ gateName: 'Gate 2', evidence: validEvidence }, actor);
    await apSvc.buildApprovalChain(g2.production_activation_gate_id, actor);
    const rolesToGrant = REQUIRED_ROLES.filter(r => r !== 'SECURITY_APPROVER');
    for (const role of rolesToGrant) {
        await apSvc.grantApproval(g2.production_activation_gate_id, role, `ref-${role}`, 'OK', actor);
    }
    const eval2 = apSvc.evaluateChain(g2.production_activation_gate_id);
    assert(!eval2.complete && eval2.missing.includes('SECURITY_APPROVER'), 'SC3: Missing SECURITY_APPROVER blocks chain');

    // SC4: Missing COMPLIANCE_APPROVER blocks chain
    const g3 = await gateSvc.createGate({ gateName: 'Gate 3', evidence: validEvidence }, actor);
    await apSvc.buildApprovalChain(g3.production_activation_gate_id, actor);
    const rolesToGrant3 = REQUIRED_ROLES.filter(r => r !== 'COMPLIANCE_APPROVER');
    for (const role of rolesToGrant3) {
        await apSvc.grantApproval(g3.production_activation_gate_id, role, `ref-${role}`, 'OK', actor);
    }
    const eval3 = apSvc.evaluateChain(g3.production_activation_gate_id);
    assert(!eval3.complete && eval3.missing.includes('COMPLIANCE_APPROVER'), 'SC4: Missing COMPLIANCE_APPROVER blocks chain');

    // SC5: Approver reference is hashed, not stored in plaintext
    const approvals = apSvc._mockApprovals.filter(a => a.production_activation_gate_id === g1.production_activation_gate_id);
    assert(approvals.every(a => a.approver_reference === null), 'SC5: Approver reference not stored in plaintext');
    assert(approvals.every(a => a.approver_reference_hash && a.approver_reference_hash.startsWith('[HASH:')), 'SC5: Approver reference hash stored');

    // SC6: Approval does not activate production
    const src = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProductionActivationApprovalService.js'), 'utf-8');
    assert(!src.includes('activateProduction'), 'SC6: Approval does not activate production');

    // SC7: Approval does not mutate source records
    assert(!src.includes('UPDATE orders') && !src.includes('DELETE FROM'), 'SC7: Approval does not mutate source records');

    // SC8: Audit events exist
    assert(apSvc._mockEvents.some(e => e.event_type === 'FINOPS_PRODUCTION_ACTIVATION_APPROVAL_CREATED'), 'SC8.1: Approval creation audited');
    assert(apSvc._mockEvents.some(e => e.event_type === 'FINOPS_PRODUCTION_ACTIVATION_APPROVAL_GRANTED_FOR_GATE_READINESS'), 'SC8.2: Approval grant audited');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 113C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);
    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => { console.error('Smoke crashed:', err); process.exit(1); });
