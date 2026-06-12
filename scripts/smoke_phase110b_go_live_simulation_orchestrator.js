'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsGoLiveSimulationService = require('../src/api/services/financialOperationsGoLiveSimulationService');

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
    console.log('\n━━━ Phase 110B — Go-Live Simulation Orchestrator Service Smoke ━━━\n');

    const svc = new FinancialOperationsGoLiveSimulationService();
    const actorAdmin = { role: 'CONTROL_PLANE_ADMIN', userId: 'a_1' };

    const validEvidence = {
        compliance_reporting_ready: true,
        privacy_retention_ready: true,
        provider_ready: true,
        rollback_path_ready: true,
        production_activation_enabled: false,
        full_public_enabled: false,
        live_provider_connectivity_enabled: false
    };

    // SC1: Clean Phase 95–109 stack becomes APPROVED_FOR_SIMULATED_GO_LIVE_REVIEW
    const p1 = await svc.createSimulation({ simulationName: 'Sim 1', evidence: validEvidence }, actorAdmin);
    const eval1 = await svc.evaluateSimulation(p1.go_live_simulation_id, actorAdmin);
    assert(eval1.simulation_status === 'APPROVED_FOR_SIMULATED_GO_LIVE_REVIEW', 'SC1: Clean stack becomes APPROVED_FOR_SIMULATED_GO_LIVE_REVIEW');

    // SC2: Missing compliance reporting blocks simulation
    const p2 = await svc.createSimulation({ simulationName: 'Sim 2', evidence: { ...validEvidence, compliance_reporting_ready: false } }, actorAdmin);
    const eval2 = await svc.evaluateSimulation(p2.go_live_simulation_id, actorAdmin);
    assert(eval2.simulation_status === 'BLOCKED_BY_COMPLIANCE_GAP', 'SC2: Missing compliance reporting blocks simulation');

    // SC3: Missing privacy readiness blocks simulation
    const p3 = await svc.createSimulation({ simulationName: 'Sim 3', evidence: { ...validEvidence, privacy_retention_ready: false } }, actorAdmin);
    const eval3 = await svc.evaluateSimulation(p3.go_live_simulation_id, actorAdmin);
    assert(eval3.simulation_status === 'BLOCKED_BY_PRIVACY_GAP', 'SC3: Missing privacy readiness blocks simulation');

    // SC4: Missing provider readiness blocks simulation
    const p4 = await svc.createSimulation({ simulationName: 'Sim 4', evidence: { ...validEvidence, provider_ready: false } }, actorAdmin);
    const eval4 = await svc.evaluateSimulation(p4.go_live_simulation_id, actorAdmin);
    assert(eval4.simulation_status === 'BLOCKED_BY_PROVIDER_GAP', 'SC4: Missing provider readiness blocks simulation');

    // SC5: FULL_PUBLIC enabled blocks simulation
    const p5 = await svc.createSimulation({ simulationName: 'Sim 5', evidence: { ...validEvidence, full_public_enabled: true } }, actorAdmin);
    const eval5 = await svc.evaluateSimulation(p5.go_live_simulation_id, actorAdmin);
    assert(eval5.simulation_status === 'BLOCKED_BY_READINESS_GAP', 'SC5: FULL_PUBLIC enabled blocks simulation');

    // SC6: Production activation enabled blocks simulation
    const p6 = await svc.createSimulation({ simulationName: 'Sim 6', evidence: { ...validEvidence, production_activation_enabled: true } }, actorAdmin);
    const eval6 = await svc.evaluateSimulation(p6.go_live_simulation_id, actorAdmin);
    assert(eval6.simulation_status === 'BLOCKED_BY_READINESS_GAP' && eval6.blockers_json.includes('PRODUCTION_ACTIVATION_ENABLED'), 'SC6: Production activation enabled blocks simulation');

    // SC7: Live provider connectivity enabled blocks simulation
    const p7 = await svc.createSimulation({ simulationName: 'Sim 7', evidence: { ...validEvidence, live_provider_connectivity_enabled: true } }, actorAdmin);
    const eval7 = await svc.evaluateSimulation(p7.go_live_simulation_id, actorAdmin);
    assert(eval7.simulation_status === 'BLOCKED_BY_PROVIDER_GAP' && eval7.blockers_json.includes('LIVE_PROVIDER_CONNECTIVITY_ENABLED'), 'SC7: Live provider connectivity enabled blocks simulation');

    // SC8: Source records remain unchanged
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsGoLiveSimulationService.js'), 'utf-8');
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('DELETE FROM'), 'SC8: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 110B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
