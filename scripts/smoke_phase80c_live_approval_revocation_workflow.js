'use strict';
/**
 * scripts/smoke_phase80c_live_approval_revocation_workflow.js
 *
 * Phase 80C — Live Approval / Revocation Workflow Smoke Test.
 */

const LiveApprovalWorkflowService = require('../src/api/services/liveApprovalWorkflowService');
const LiveProductionEnablementService = require('../src/api/services/liveProductionEnablementService');
const LiveReadinessEvaluationService = require('../src/api/services/liveReadinessEvaluationService');

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
        this.revocations = [];
    }
    async query(sql, params) {
        if (sql.includes('live_production_approval_events')) {
            if (sql.includes('INSERT')) {
                this.events.push({ sql, params });
                return [];
            }
            if (sql.includes('SELECT')) {
                // Mock return of timeline events based on inserted events
                return this.events.map((e, i) => ({ id: i, event_type: e.params[4] }));
            }
        }
        if (sql.includes('live_production_revocations')) {
            this.revocations.push({ sql, params });
            return [];
        }
        return [];
    }
}

async function runSmoke() {
    console.log('\n━━━ Phase 80C — Live Approval / Revocation Workflow Smoke ━━━\n');

    const db = new MockDb();
    const enablementSvc = new LiveProductionEnablementService(db);
    const readinessSvc = new LiveReadinessEvaluationService();
    const workflowSvc = new LiveApprovalWorkflowService({
        liveProductionEnablementService: enablementSvc,
        liveReadinessEvaluationService: readinessSvc,
        db
    });

    const tenantId = 't_123';
    const printhouseId = 'ph_123';

    // Actors
    const partnerActor = { userId: 'p_1', role: 'TENANT_ADMIN' };
    const opsActor = { userId: 'o_1', role: 'OPS_ADMIN' };
    const sysActor = { userId: 's_1', role: 'SYSTEM_ADMIN' };
    const badActor = { userId: 'b_1', role: 'UNKNOWN_ROLE' };

    // Set initial mock state in enablement service
    let currentState = enablementSvc._mockDefault(tenantId, printhouseId);
    enablementSvc.getLiveEnablement = async () => currentState;

    // SC1: Partner admin can request review only
    currentState = await workflowSvc.submitLiveApprovalRequest({ tenantId, printhouseId, liveScope: 'LIMITED_LIVE', actor: partnerActor });
    assert(currentState.enablement_status === 'REQUESTED', 'SC1: Partner admin can request review');

    // SC2: Partner admin cannot approve
    let partnerApproveBlocked = false;
    try {
        await workflowSvc.approveLiveApprovalRequest({ tenantId, printhouseId, actor: partnerActor, approvalNotes: 'approve' });
    } catch (err) {
        partnerApproveBlocked = true;
    }
    assert(partnerApproveBlocked, 'SC2: Partner admin cannot approve');

    // SC14: Unauthorized actor blocked
    let unauthorizedBlocked = false;
    try {
        await workflowSvc.submitLiveApprovalRequest({ tenantId, printhouseId, liveScope: 'LIMITED_LIVE', actor: badActor });
    } catch (err) {
        unauthorizedBlocked = true;
    }
    assert(unauthorizedBlocked, 'SC14: Unauthorized actor blocked');

    // SC3: OPS_ADMIN can review
    currentState = await workflowSvc.reviewLiveApprovalRequest({ tenantId, printhouseId, actor: opsActor });
    assert(currentState.enablement_status === 'UNDER_REVIEW', 'SC3: OPS_ADMIN can review');

    // SC15: No workflow bypasses readiness engine (approve without readiness fails)
    let approveWithoutReadinessBlocked = false;
    readinessSvc._mockState = { tenant_pilot: 'FAIL' }; // Force readiness to fail
    try {
        await workflowSvc.approveLiveApprovalRequest({ tenantId, printhouseId, actor: sysActor, approvalNotes: 'approve' });
    } catch (err) {
        approveWithoutReadinessBlocked = true;
    }
    assert(approveWithoutReadinessBlocked, 'SC15: Approval blocked if readiness fails (no bypass)');

    // Fix readiness so we can approve
    readinessSvc._mockState = {};

    // SC4 & SC5 & SC6: SYSTEM_ADMIN can approve, stores snapshot, does not activate
    currentState = await workflowSvc.approveLiveApprovalRequest({ tenantId, printhouseId, actor: sysActor, approvalNotes: 'ok', approvalPayload: { foo: 'bar' } });
    assert(currentState.enablement_status === 'APPROVED', 'SC4: SYSTEM_ADMIN can approve');
    assert(currentState.approval_snapshot_json.readiness_hash !== undefined, 'SC5: Approval stores readiness snapshot hash');
    assert(currentState.live_production_enabled === false, 'SC6: Approval does not activate live');

    // SC7: Activation from approved works
    currentState = await workflowSvc.activateControlledLive({ tenantId, printhouseId, actor: sysActor });
    assert(currentState.enablement_status === 'ACTIVE' && currentState.live_production_enabled === true, 'SC7: Activation from approved works');

    // SC9: Pause active live
    currentState = await workflowSvc.pauseControlledLive({ tenantId, printhouseId, actor: opsActor, reason: 'Testing pause' });
    assert(currentState.enablement_status === 'PAUSED' && currentState.live_production_enabled === false, 'SC9: Pause active live blocks new live entries');

    // SC10: Resume paused live requires no critical blockers
    readinessSvc._mockState = { operational_monitoring: 'CRITICAL_INCIDENT' };
    let resumeBlocked = false;
    try {
        await workflowSvc.resumeControlledLive({ tenantId, printhouseId, actor: sysActor });
    } catch (err) {
        resumeBlocked = true;
    }
    assert(resumeBlocked, 'SC10: Resume paused live requires no critical blockers');
    
    // Resume properly
    readinessSvc._mockState = {};
    currentState = await workflowSvc.resumeControlledLive({ tenantId, printhouseId, actor: sysActor });
    assert(currentState.enablement_status === 'ACTIVE', 'SC10: Resume works when readiness passes');

    // SC11 & SC12: Revocation disables live immediately, impact scope stored
    currentState = await workflowSvc.revokeControlledLive({ tenantId, printhouseId, actor: sysActor, reason: 'Test revoke', impactScope: 'FULL_STOP' });
    assert(currentState.enablement_status === 'REVOKED' && currentState.live_production_enabled === false, 'SC11: Revocation disables live immediately');
    assert(db.revocations.length > 0 && db.revocations[0].params[5] === 'FULL_STOP', 'SC12: Revocation impact scope stored');

    // SC8: Activation from rejected blocked
    let rejectedState = enablementSvc._mockDefault(tenantId, printhouseId);
    rejectedState.enablement_status = 'REJECTED';
    enablementSvc.getLiveEnablement = async () => rejectedState;
    let actRejectedBlocked = false;
    try {
        await workflowSvc.activateControlledLive({ tenantId, printhouseId, actor: sysActor });
    } catch (err) {
        actRejectedBlocked = true;
    }
    assert(actRejectedBlocked, 'SC8: Activation from rejected blocked');

    // SC13: Timeline
    const timeline = await workflowSvc.getLiveApprovalTimeline({ tenantId, printhouseId });
    const eventTypes = timeline.map(e => e.event_type);
    const hasRequired = ['LIVE_ENABLEMENT_REQUESTED', 'LIVE_ENABLEMENT_UNDER_REVIEW', 'LIVE_ENABLEMENT_APPROVED', 'LIVE_ENABLEMENT_ACTIVATED', 'LIVE_ENABLEMENT_REVOKED'].every(type => eventTypes.includes(type));
    assert(hasRequired, 'SC13: Timeline includes request/review/approve/activate/revoke', `Found events: ${eventTypes.length}`);

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 80C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
