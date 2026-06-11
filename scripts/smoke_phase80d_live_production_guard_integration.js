'use strict';
/**
 * scripts/smoke_phase80d_live_production_guard_integration.js
 *
 * Phase 80D — Live Production Guard Integration Smoke Test.
 */

const LiveProductionGuardService = require('../src/api/services/liveProductionGuardService');
const LiveProductionEnablementService = require('../src/api/services/liveProductionEnablementService');

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

class MockDb {
    constructor() {
        this.events = [];
    }
    async query(sql, params) {
        if (sql.includes('live_production_guard_decisions')) {
            this.events.push({ sql, params });
        }
        return [];
    }
}

async function runSmoke() {
    console.log('\n━━━ Phase 80D — Live Production Guard Integration Smoke ━━━\n');

    const db = new MockDb();
    const enablementSvc = new LiveProductionEnablementService(db);
    const guardSvc = new LiveProductionGuardService({
        liveProductionEnablementService: enablementSvc,
        db
    });

    const tenantId = 't_123';
    const printhouseId = 'ph_123';
    const actor = { userId: 'u_1', role: 'SYSTEM_ADMIN' };

    let state = enablementSvc._mockDefault(tenantId, printhouseId);
    enablementSvc.getLiveEnablement = async () => state;

    // SC1: NOT ACTIVE blocks
    let decision = await guardSvc.evaluateGuard('CREATE_LIVE_ORDER', { tenantId, printhouseId, actor });
    assert(decision.decision === 'BLOCKED', 'SC1: Enablement NOT ACTIVE blocks all live actions');

    // SC2: ACTIVE but live_production_enabled=false blocks
    state.enablement_status = 'ACTIVE';
    state.live_production_enabled = false;
    decision = await guardSvc.evaluateGuard('CREATE_LIVE_ORDER', { tenantId, printhouseId, actor });
    assert(decision.decision === 'BLOCKED', 'SC2: ACTIVE but live_production_enabled=false blocks');

    // SC3: ACTIVE and enabled allows
    state.live_production_enabled = true;
    state.live_scope = 'FULL_LIVE';
    decision = await guardSvc.evaluateGuard('CREATE_LIVE_ORDER', { tenantId, printhouseId, actor });
    assert(decision.decision === 'ALLOWED', 'SC3: ACTIVE and enabled allows actions');

    // SC4: Missing live scope blocks
    state.live_scope = null;
    decision = await guardSvc.evaluateGuard('CREATE_LIVE_ORDER', { tenantId, printhouseId, actor });
    assert(decision.decision === 'BLOCKED' && decision.blocking_reasons.includes('Live scope is missing.'), 'SC4: Missing live_scope blocks');

    // SC5 & SC6: INTERNAL_TEST scope
    state.live_scope = 'INTERNAL_TEST';
    decision = await guardSvc.evaluateGuard('CREATE_LIVE_ORDER', { tenantId, printhouseId, actor, context: { isInternalTest: false } });
    assert(decision.decision === 'BLOCKED', 'SC5: INTERNAL_TEST scope blocks if context mismatch');
    
    decision = await guardSvc.evaluateGuard('CREATE_LIVE_ORDER', { tenantId, printhouseId, actor, context: { isInternalTest: true } });
    assert(decision.decision === 'ALLOWED', 'SC6: INTERNAL_TEST scope allows if context matches');

    // SC7: Max daily orders
    state.live_scope = 'FULL_LIVE';
    state.max_live_orders_per_day = 10;
    decision = await guardSvc.evaluateGuard('CREATE_LIVE_ORDER', { tenantId, printhouseId, actor, context: { currentOrdersToday: 10 } });
    assert(decision.decision === 'BLOCKED', 'SC7: Max daily orders check blocks if exceeded');

    // SC8: Manual handoff approval
    state.require_manual_handoff_approval = true;
    decision = await guardSvc.evaluateGuard('GENERATE_LIVE_HANDOFF', { tenantId, printhouseId, actor, context: { hasManualHandoffApproval: false } });
    assert(decision.decision === 'BLOCKED', 'SC8: require_manual_handoff_approval blocks if missing');

    // SC9: Artifact trust
    state.require_artifact_trust_certified = true;
    decision = await guardSvc.evaluateGuard('ENTER_LIVE_QUEUE', { tenantId, printhouseId, actor, context: { hasArtifactTrust: false } });
    assert(decision.decision === 'BLOCKED', 'SC9: require_artifact_trust_certified blocks if missing');

    // SC10: PARTNER_PILOT warning
    state.live_scope = 'PARTNER_PILOT';
    decision = await guardSvc.evaluateGuard('START_LIVE_PRODUCTION', { tenantId, printhouseId, actor, context: { isPartnerPilot: false } });
    assert(decision.decision === 'WARNING' && decision.warning_reasons.length > 0, 'SC10: WARNING decision returned for PARTNER_PILOT warning reason');

    // SC11: Operator confirmation
    state.live_scope = 'FULL_LIVE';
    state.require_operator_confirmation = true;
    decision = await guardSvc.evaluateGuard('SEND_TO_PRINTHOUSE', { tenantId, printhouseId, actor, context: { needsOperatorConfirmation: true } });
    assert(decision.decision === 'REVIEW_REQUIRED', 'SC11: REVIEW_REQUIRED decision returned for require_operator_confirmation');

    // SC13 & SC14: checkGuardOrThrow
    state.require_operator_confirmation = false;
    let didThrow = false;
    try {
        await guardSvc.checkGuardOrThrow('ENTER_LIVE_QUEUE', { tenantId, printhouseId, actor, context: { hasArtifactTrust: false } }); // Should block
    } catch (e) {
        didThrow = true;
    }
    assert(didThrow, 'SC13: checkGuardOrThrow throws on BLOCKED');

    didThrow = false;
    try {
        await guardSvc.checkGuardOrThrow('ENTER_LIVE_QUEUE', { tenantId, printhouseId, actor, context: { hasArtifactTrust: true } }); // Should allow
    } catch (e) {
        didThrow = true;
    }
    assert(!didThrow, 'SC14: checkGuardOrThrow does not throw on ALLOWED');

    // SC12: Audits
    assert(db.events.length > 10, 'SC12: Audit records created for all decisions');

    // SC15: No mutation
    assert(state.enablement_status === 'ACTIVE', 'SC15: The guard does not modify enablement state');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 80D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
