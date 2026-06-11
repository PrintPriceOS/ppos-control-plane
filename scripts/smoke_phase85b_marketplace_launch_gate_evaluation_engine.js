'use strict';

const fs = require('fs');
const path = require('path');
const MarketplaceLaunchReadinessService = require('../src/api/services/marketplaceLaunchReadinessService');

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
    console.log('\n━━━ Phase 85B — Marketplace Launch Gate Evaluation Engine Smoke ━━━\n');

    const svc = new MarketplaceLaunchReadinessService();
    const actor = { role: 'SYSTEM_ADMIN' };

    // SC1
    let r = await svc.evaluatePublicMarketplaceReadiness({ actor });
    assert(r.ready_for_launch_review === true, 'SC1: All domains pass -> ready_for_launch_review true');

    // SC2
    svc.mockState.artifact_trust_active = false;
    r = await svc.evaluatePublicMarketplaceReadiness({ actor });
    assert(r.ready_for_launch_review === false && r.blocking_reasons.some(b => b.includes('artifact trust')), 'SC2: Missing artifact trust blocks');
    svc.mockState.artifact_trust_active = true;

    // SC3
    svc.mockState.live_guard_active = false;
    r = await svc.evaluatePublicMarketplaceReadiness({ actor });
    assert(r.ready_for_launch_review === false && r.blocking_reasons.some(b => b.includes('live order guard')), 'SC3: Missing live guard blocks');
    svc.mockState.live_guard_active = true;

    // SC4
    svc.mockState.command_center_active = false;
    r = await svc.evaluatePublicMarketplaceReadiness({ actor });
    assert(r.ready_for_launch_review === false && r.blocking_reasons.some(b => b.includes('admin command center')), 'SC4: Missing command center blocks');
    svc.mockState.command_center_active = true;

    // SC5
    svc.mockState.emergency_stop_available = false;
    r = await svc.evaluatePublicMarketplaceReadiness({ actor });
    assert(r.ready_for_launch_review === false && r.blocking_reasons.some(b => b.includes('emergency stop')), 'SC5: Missing emergency stop blocks');
    svc.mockState.emergency_stop_available = true;

    // SC6
    svc.mockState.customer_portal_active = false;
    r = await svc.evaluatePublicMarketplaceReadiness({ actor });
    assert(r.ready_for_launch_review === false && r.blocking_reasons.some(b => b.includes('customer portal')), 'SC6: Missing customer portal blocks');
    svc.mockState.customer_portal_active = true;

    // SC7
    svc.mockState.partner_job_board_active = false;
    r = await svc.evaluatePublicMarketplaceReadiness({ actor });
    assert(r.ready_for_launch_review === false && r.blocking_reasons.some(b => b.includes('partner job board')), 'SC7: Missing partner job board blocks');
    svc.mockState.partner_job_board_active = true;

    // SC8
    svc.mockState.payment_mode = 'DISABLED';
    r = await svc.evaluatePublicMarketplaceReadiness({ actor });
    assert(r.ready_for_launch_review === false && r.blocking_reasons.some(b => b.includes('payment mode')), 'SC8: Missing payment mode blocks');
    svc.mockState.payment_mode = 'PAYMENT_REFERENCE_ONLY';

    // SC9
    svc.mockState.cohort_scope_defined = false;
    r = await svc.evaluatePublicMarketplaceReadiness({ cohortId: 'coh_1', actor });
    assert(r.ready_for_launch_review === false && r.blocking_reasons.some(b => b.includes('Cohort scope')), 'SC9: Missing cohort scope blocks');
    svc.mockState.cohort_scope_defined = true;

    // SC10
    svc.mockState.has_forbidden_claims = true;
    r = await svc.evaluatePublicMarketplaceReadiness({ actor });
    assert(r.ready_for_launch_review === false && r.blocking_reasons.some(b => b.includes('Forbidden')), 'SC10: Forbidden claims block');
    svc.mockState.has_forbidden_claims = false;

    // SC11
    svc.mockState.tenant_isolation_active = false;
    r = await svc.evaluatePublicMarketplaceReadiness({ actor });
    assert(r.ready_for_launch_review === false && r.blocking_reasons.some(b => b.includes('Tenant isolation')), 'SC11: Tenant isolation failure blocks');
    svc.mockState.tenant_isolation_active = true;

    // SC12
    const s1 = await svc.buildLaunchReadinessSnapshot({ actor });
    const s2 = await svc.buildLaunchReadinessSnapshot({ actor });
    assert(s1.snapshot_hash === s2.snapshot_hash, 'SC12: Snapshot hash deterministic');

    // SC13
    assert(r.ready_for_full_public === false, 'SC13: Readiness does not enable launch');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 85B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
