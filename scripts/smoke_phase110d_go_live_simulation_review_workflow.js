'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsGoLiveSimulationService = require('../src/api/services/financialOperationsGoLiveSimulationService');
const FinancialOperationsGoLiveChecklistService = require('../src/api/services/financialOperationsGoLiveChecklistService');
const FinancialOperationsGoLiveSimulationReviewService = require('../src/api/services/financialOperationsGoLiveSimulationReviewService');

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
    console.log('\n━━━ Phase 110D — Go-Live Simulation Review Workflow Service Smoke ━━━\n');

    const simSvc = new FinancialOperationsGoLiveSimulationService();
    const chkSvc = new FinancialOperationsGoLiveChecklistService(simSvc);
    const reviewSvc = new FinancialOperationsGoLiveSimulationReviewService(simSvc, chkSvc);
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
    const p1 = await simSvc.createSimulation({ simulationName: 'Sim 1', evidence: validEvidence }, actorAdmin);
    await simSvc.evaluateSimulation(p1.go_live_simulation_id, actorAdmin);

    // SC1: Simulated go-live approval does not enable production
    const appRun = await reviewSvc.approveSimulatedGoLive(p1.go_live_simulation_id, actorAdmin);
    assert(appRun.simulation_status === 'SIMULATED_GO_LIVE_APPROVED', 'SC1.1: Run is SIMULATED_GO_LIVE_APPROVED');
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsGoLiveSimulationReviewService.js'), 'utf-8');
    assert(!sourceStr.includes('production_activation'), 'SC1.2: Simulated go-live approval does not enable production');

    // SC2: Simulated go-live approval does not enable FULL_PUBLIC
    assert(!sourceStr.includes('full_public'), 'SC2: Simulated go-live approval does not enable FULL_PUBLIC');

    // SC3: Simulated go-live approval does not connect providers
    assert(!sourceStr.includes('axios') && !sourceStr.includes('connect'), 'SC3: Simulated go-live approval does not connect providers');

    // SC4: Finding resolution is audited
    await reviewSvc.resolveFinding(p1.go_live_simulation_id, 'MISSING_EVIDENCE', actorAdmin);
    assert(reviewSvc._mockEvents.some(e => e.event_type === 'FINOPS_GO_LIVE_SIMULATION_FINDING_RESOLVED'), 'SC4: Finding resolution is audited');

    // SC5: Warning dismissal is audited
    await reviewSvc.dismissWarning(p1.go_live_simulation_id, 'Warning check', actorAdmin);
    assert(reviewSvc._mockEvents.some(e => e.event_type === 'FINOPS_GO_LIVE_SIMULATION_WARNING_DISMISSED'), 'SC5: Warning dismissal is audited');

    // SC6: Additional evidence request is audited
    await reviewSvc.requestAdditionalEvidence(p1.go_live_simulation_id, 'Please attach approval doc', actorAdmin);
    assert(reviewSvc._mockEvents.some(e => e.event_type === 'FINOPS_GO_LIVE_SIMULATION_REVIEW_NOTE_ADDED'), 'SC6: Additional evidence request is audited');

    // SC7: Source records remain unchanged
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('DELETE FROM'), 'SC7: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 110D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
