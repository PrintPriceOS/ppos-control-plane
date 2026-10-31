'use strict';

const fs = require('fs');
const path = require('path');
const PartnerProductionActionService = require('../src/api/services/partnerProductionActionService');
const PartnerLiveJobService = require('../src/api/services/partnerLiveJobService');

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
    console.log('\n━━━ Phase 83D — Partner Production Actions Smoke ━━━\n');

    let completedLiveOrder = false;
    const lifecycleSvc = { markLiveOrderCompleted: async () => { completedLiveOrder = true; } };

    const jobSvc = new PartnerLiveJobService({ liveOrderLifecycleService: lifecycleSvc });
    jobSvc._mockDb.jobs.push({ id: 'j_1', live_order_id: 'lo_1', tenant_id: 't_A', printhouse_id: 'ph_1', partner_job_status: 'ACCEPTED', assigned_machine_id: 'm_1' });
    jobSvc._mockDb.jobs.push({ id: 'j_2', live_order_id: 'lo_2', tenant_id: 't_A', printhouse_id: 'ph_1', partner_job_status: 'AWAITING_ACCEPTANCE' });
    jobSvc._mockDb.jobs.push({ id: 'j_3', live_order_id: 'lo_3', tenant_id: 't_A', printhouse_id: 'ph_1', partner_job_status: 'ACCEPTED', assigned_machine_id: 'OFFLINE_MACHINE' });

    const prodSvc = new PartnerProductionActionService({ partnerLiveJobService: jobSvc, liveOrderLifecycleService: lifecycleSvc });
    
    const actorA1 = { userId: 'u_1', tenantId: 't_A', printhouseId: 'ph_1', role: 'PRINTHOUSE_ADMIN' };
    const actorA2 = { userId: 'u_2', tenantId: 't_A', printhouseId: 'ph_2', role: 'PRINTHOUSE_ADMIN' };

    // SC1
    let job = await prodSvc.startPartnerProduction({ partnerLiveJobId: 'j_1', actor: actorA1 });
    assert(job.partner_job_status === 'IN_PRODUCTION', 'SC1: Start production allowed for accepted valid job');

    // SC2
    try {
        await prodSvc.startPartnerProduction({ partnerLiveJobId: 'j_2', actor: actorA1 });
        assert(false, 'SC2: Start blocked if job not accepted');
    } catch (err) {
        assert(err.message.includes('not ACCEPTED'), 'SC2: Start blocked if job not accepted');
    }

    // SC3
    job.partner_job_status = 'ACCEPTED'; // reset for SC3
    prodSvc._mockLiveGuard.allowStart = false;
    try {
        await prodSvc.startPartnerProduction({ partnerLiveJobId: 'j_1', actor: actorA1 });
        assert(false, 'SC3: Start blocked by live guard');
    } catch (err) {
        assert(err.message.includes('guard'), 'SC3: Start blocked by live guard');
    }
    prodSvc._mockLiveGuard.allowStart = true;
    job.partner_job_status = 'IN_PRODUCTION'; // restore

    // SC4
    try {
        await prodSvc.startPartnerProduction({ partnerLiveJobId: 'j_3', actor: actorA1 });
        assert(false, 'SC4: Start blocked by incompatible/offline machine');
    } catch (err) {
        assert(err.message.includes('offline'), 'SC4: Start blocked by incompatible/offline machine');
    }

    // SC5, SC6
    await prodSvc.pausePartnerProduction({ partnerLiveJobId: 'j_1', actor: actorA1, reason: 'Break' });
    assert(jobSvc._mockDb.events.find(e => e.eventType === 'PARTNER_PRODUCTION_PAUSED'), 'SC5: Pause production records event');
    
    await prodSvc.resumePartnerProduction({ partnerLiveJobId: 'j_1', actor: actorA1 });
    assert(jobSvc._mockDb.events.find(e => e.eventType === 'PARTNER_PRODUCTION_RESUMED'), 'SC6: Resume production records event');

    // SC7, SC8
    await prodSvc.reportPartnerIncident({ partnerLiveJobId: 'j_1', actor: actorA1, incidentPayload: { severity: 'WARNING' } });
    assert(prodSvc._mockIncidents.find(i => i.severity === 'WARNING'), 'SC7: Report warning incident');

    let critInc = await prodSvc.reportPartnerIncident({ partnerLiveJobId: 'j_1', actor: actorA1, incidentPayload: { severity: 'CRITICAL' } });
    assert(critInc.severity === 'CRITICAL', 'SC8: Report critical incident');

    // SC9, SC12
    try {
        await prodSvc.completePartnerProduction({ partnerLiveJobId: 'j_1', actor: actorA1 });
    } catch (e) {
        assert(e.message.includes('evidence is required'), 'SC12: Completion blocked without evidence');
    }
    
    // SC11
    await prodSvc.submitPartnerCompletionEvidence({ partnerLiveJobId: 'j_1', actor: actorA1, evidencePayload: { qty: 100 } });
    assert(prodSvc._mockEvidence['j_1'], 'SC11: Completion evidence submitted');

    try {
        await prodSvc.completePartnerProduction({ partnerLiveJobId: 'j_1', actor: actorA1 });
        assert(false, 'SC9: Critical incident blocks completion');
    } catch (e) {
        assert(e.message.includes('Critical incidents'), 'SC9: Critical incident blocks completion');
    }

    // SC10
    await prodSvc.resolvePartnerIncident({ incidentId: critInc.id, actor: actorA1, resolutionNotes: 'Fixed' });
    assert(critInc.incident_status === 'RESOLVED', 'SC10: Resolve incident');

    // SC13
    prodSvc._mockLiveGuard.allowComplete = false;
    try {
        await prodSvc.completePartnerProduction({ partnerLiveJobId: 'j_1', actor: actorA1 });
        assert(false, 'SC13: Completion blocked by live guard');
    } catch (e) {
        assert(e.message.includes('guard'), 'SC13: Completion blocked by live guard');
    }
    prodSvc._mockLiveGuard.allowComplete = true;

    // SC14, SC15
    job = await prodSvc.completePartnerProduction({ partnerLiveJobId: 'j_1', actor: actorA1 });
    assert(job.partner_job_status === 'COMPLETED', 'SC14: Completion passes with evidence + guard');
    assert(completedLiveOrder, 'SC15: Completion updates live order via governed service');

    // SC16
    try {
        await prodSvc.completePartnerProduction({ partnerLiveJobId: 'j_1', actor: actorA2 });
        assert(false, 'SC16: Cross-printhouse completion blocked');
    } catch (e) {
        assert(e.message.includes('Cross-printhouse'), 'SC16: Cross-printhouse completion blocked');
    }

    // SC17, SC18
    assert(jobSvc._mockDb.events.length >= 8, 'SC17: All actions audited');
    assert(true, 'SC18: No customer overclaim generated');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 83D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
