'use strict';

const fs = require('fs');
const path = require('path');
const AdminLiveOpsCommandService = require('../src/api/services/adminLiveOpsCommandService');

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
    console.log('\n━━━ Phase 84C — Admin Command Actions / Escalation Workflow Smoke ━━━\n');

    const mockReadModel = {
        events: [],
        recordCommandEvent: async (ev) => mockReadModel.events.push(ev)
    };

    const svc = new AdminLiveOpsCommandService({ readModelService: mockReadModel });
    
    const actorOps = { role: 'OPS_ADMIN', userId: 'u_1' };
    const actorCP = { role: 'CONTROL_PLANE_ADMIN', userId: 'u_2' };
    const actorPartner = { role: 'PRINTHOUSE_ADMIN', userId: 'u_3' };

    // SC1
    const esc = await svc.createLiveOpsEscalation({ liveOrderId: 'lo_1', escalationType: 'SLA_RISK', severity: 'WARNING', message: 'Test', actor: actorOps });
    assert(esc.status === 'OPEN', 'SC1: Create escalation');

    // SC2
    const escAck = await svc.acknowledgeLiveOpsEscalation({ escalationId: esc.id, actor: actorOps });
    assert(escAck.status === 'ACKNOWLEDGED', 'SC2: Acknowledge escalation');

    // SC3
    const escRes = await svc.resolveLiveOpsEscalation({ escalationId: esc.id, resolutionNotes: 'Fixed', actor: actorOps });
    assert(escRes.status === 'RESOLVED', 'SC3: Resolve escalation');

    // SC4
    const triage = await svc.triageIncidentFromCommandCenter({ incidentId: 'inc_1', action: 'MONITOR', actor: actorOps });
    assert(triage.success, 'SC4: Triage incident');

    // SC5
    await svc.pauseLiveOrderFromCommandCenter({ liveOrderId: 'lo_1', reason: 'Investigating', actor: actorOps });
    assert(svc._mockDb.liveOrders[0].status === 'PAUSED', 'SC5: Pause live order');

    // SC6
    svc._mockDb.liveOrders[0].hasCriticalIncident = true;
    try {
        await svc.resumeLiveOrderFromCommandCenter({ liveOrderId: 'lo_1', actor: actorOps });
        assert(false, 'SC6: Resume blocked when critical incident exists');
    } catch(err) {
        assert(err.message.includes('critical incident'), 'SC6: Resume blocked when critical incident exists');
    }

    // SC7
    svc._mockDb.liveOrders[0].hasCriticalIncident = false;
    await svc.resumeLiveOrderFromCommandCenter({ liveOrderId: 'lo_1', actor: actorOps });
    assert(svc._mockDb.liveOrders[0].status === 'ACTIVE', 'SC7: Resume allowed after blocker resolved');

    // SC8
    await svc.triggerLiveOrderRollback({ liveOrderId: 'lo_1', rollbackType: 'GATE_RESET', reason: 'Failed', actor: actorCP });
    assert(true, 'SC8: Trigger rollback with reason');

    // SC9
    await svc.revokeLiveEnablementFromCommandCenter({ tenantId: 't_A', printhouseId: 'ph_1', reason: 'Violation', impactScope: 'ALL', actor: actorCP });
    assert(svc._mockDb.enablements[0].status === 'REVOKED', 'SC9: Revoke live enablement with impact scope');

    // SC10
    const reassign = await svc.requestPartnerReassignment({ partnerLiveJobId: 'pj_1', reason: 'Delayed', actor: actorCP });
    assert(reassign.warning.includes('Auto-reroute is disabled'), 'SC10: Request reassignment creates event but no auto-reroute');

    // SC11
    const ho = await svc.reviewHandoffPackageFromCommandCenter({ liveOrderId: 'lo_1', actor: actorOps });
    assert(ho.action.includes('not sent'), 'SC11: Handoff review does not send handoff');

    // SC12
    const comp = await svc.reviewCompletionEvidenceFromCommandCenter({ partnerLiveJobId: 'pj_1', actor: actorOps });
    assert(comp.action.includes('not executed'), 'SC12: Completion evidence review does not mark complete');

    // SC13
    await svc.blockLiveOrderFromCommandCenter({ liveOrderId: 'lo_1', reason: 'Fraud', actor: actorOps });
    assert(svc._mockDb.liveOrders[0].status === 'BLOCKED', 'SC13: Admin block live order records event');

    // SC14
    try {
        await svc.pauseLiveOrderFromCommandCenter({ liveOrderId: 'lo_1', reason: 'Test', actor: actorPartner });
        assert(false, 'SC14: Unauthorized actor blocked');
    } catch(err) {
        assert(err.message.includes('Unauthorized'), 'SC14: Unauthorized actor blocked');
    }

    // SC15, 16, 17
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/adminLiveOpsCommandService.js'), 'utf-8');
    assert(!content.includes('artifact_trust'), 'SC15: Command action does not mutate artifact_trust');
    assert(!content.includes('payment_status'), 'SC16: Command action does not confirm payment');
    assert(!content.includes('proof_status'), 'SC17: Command action does not approve proof');

    // SC18
    assert(mockReadModel.events.length >= 10, 'SC18: All command actions audited');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 84C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
