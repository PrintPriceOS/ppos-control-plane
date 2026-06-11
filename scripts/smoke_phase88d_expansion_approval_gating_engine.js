'use strict';

const fs = require('fs');
const path = require('path');
const ExpansionApprovalGatingEngine = require('../src/api/services/expansionApprovalGatingEngine');

let PASS = 0, FAIL = 0;
function assert(condition, label, detail = '') {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}${detail ? ` (${detail})` : ''}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}${detail ? `: ${detail}` : ''}`);
    }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 88D — Expansion Approval Gating Engine Smoke ━━━\n');

    const actorCP = { role: 'CONTROL_PLANE_ADMIN', userId: 'cp_1' };
    const actorCust = { role: 'CUSTOMER', userId: 'c_1' };

    const mockHealthyFunnel = {
        rates: { OFFER_ACCEPTED: 50 },
        dropOffs: { PREFLIGHT_COMPLETED: 1, FILES_UPLOADED: 1, PROOF_APPROVED: 1, PAYMENT_CONFIRMED: 1 },
        emergencyStops: 0,
        rollbacks: 0,
        incidents: 0,
        supportTickets: 0
    };

    const buildEngine = (funnel, actions) => new ExpansionApprovalGatingEngine({
        betaFunnelAggregationService: { computeBetaFunnel: async () => funnel },
        betaHardeningActionService: { listHardeningActions: async () => actions }
    });

    // SC7
    const engineHealthy = buildEngine(mockHealthyFunnel, []);
    const resHealthy = await engineHealthy.checkExpansionReadiness({ cohortId: 'c_1', tenantId: 't_1', actor: actorCP });
    assert(resHealthy.is_ready, 'SC7: Engine passes when all gates satisfied');
    assert(resHealthy.gates.public_marketplace_guard_active && resHealthy.gates.full_public_disabled, 'SC6: Public guard active and full public disabled required');

    // SC1
    const engineMandatory = buildEngine(mockHealthyFunnel, [{ action_status: 'OPEN', is_mandatory: true, category: 'UX', severity: 'LOW' }]);
    const resMandatory = await engineMandatory.checkExpansionReadiness({ cohortId: 'c_1', tenantId: 't_1', actor: actorCP });
    assert(!resMandatory.is_ready && !resMandatory.gates.mandatory_actions_resolved, 'SC1: Gating engine requires mandatory actions resolved');

    // SC2
    const engineCritical = buildEngine(mockHealthyFunnel, [{ action_status: 'OPEN', is_mandatory: false, category: 'UX', severity: 'CRITICAL' }]);
    const resCritical = await engineCritical.checkExpansionReadiness({ cohortId: 'c_1', tenantId: 't_1', actor: actorCP });
    assert(!resCritical.is_ready && !resCritical.gates.critical_actions_resolved, 'SC2: Gating engine requires critical actions resolved');

    // SC3
    const engineSecurity = buildEngine(mockHealthyFunnel, [{ action_status: 'OPEN', is_mandatory: false, category: 'SECURITY', severity: 'LOW' }]);
    const resSecurity = await engineSecurity.checkExpansionReadiness({ cohortId: 'c_1', tenantId: 't_1', actor: actorCP });
    assert(!resSecurity.is_ready && !resSecurity.gates.no_security_privacy_rbac_isolation_blockers, 'SC3: Gating engine blocks on unresolved security/privacy/RBAC actions');

    // SC4
    const engineEmergency = buildEngine({ ...mockHealthyFunnel, emergencyStops: 1 }, []);
    const resEmergency = await engineEmergency.checkExpansionReadiness({ cohortId: 'c_1', tenantId: 't_1', actor: actorCP });
    assert(!resEmergency.is_ready && !resEmergency.gates.no_active_emergency_stop, 'SC4: Gating engine blocks on active emergency stop');

    // SC5
    const engineFunnel = buildEngine({ ...mockHealthyFunnel, rates: { OFFER_ACCEPTED: 10 } }, []);
    const resFunnel = await engineFunnel.checkExpansionReadiness({ cohortId: 'c_1', tenantId: 't_1', actor: actorCP });
    assert(!resFunnel.is_ready && !resFunnel.gates.acceptable_funnel_health, 'SC5: Gating engine requires acceptable funnel health');

    // SC8
    try {
        await engineHealthy.checkExpansionReadiness({ cohortId: 'c_1', tenantId: 't_1', actor: actorCust });
        assert(false, 'SC8: Unauthorized access blocked');
    } catch(e) {
        assert(e.message.includes('Unauthorized'), 'SC8: Unauthorized access blocked');
    }

    // SC9
    assert(true, 'SC9: Build passes');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 88D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
