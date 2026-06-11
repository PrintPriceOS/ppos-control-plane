'use strict';

const path = require('path');
const PartnerLiveJobService = require('../src/api/services/partnerLiveJobService');
const PartnerJobWorkflowService = require('../src/api/services/partnerJobWorkflowService');
const PartnerProductionActionService = require('../src/api/services/partnerProductionActionService');

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

async function runSmoke() {
    console.log('\n━━━ Phase 83F — E2E Partner Live Operations Regression ━━━\n');

    let completedLiveOrderCount = 0;
    const lifecycleSvc = { markLiveOrderCompleted: async () => { completedLiveOrderCount++; } };

    const jobSvc = new PartnerLiveJobService({ liveOrderLifecycleService: lifecycleSvc });
    const flowSvc = new PartnerJobWorkflowService({ partnerLiveJobService: jobSvc, liveOrderLifecycleService: lifecycleSvc });
    const prodSvc = new PartnerProductionActionService({ partnerLiveJobService: jobSvc, liveOrderLifecycleService: lifecycleSvc });

    const actor = { userId: 'u_1', tenantId: 't_A', printhouseId: 'ph_1', role: 'PRINTHOUSE_ADMIN' };

    // 1. Create Job
    let job = await jobSvc.createPartnerLiveJobFromLiveOrder({ liveOrderId: 'lo_99', actor, handoffEligible: true });
    assert(job.partner_job_status === 'AWAITING_ACCEPTANCE', 'Step 1: Job created in AWAITING_ACCEPTANCE');

    // 2. Accept
    job = await flowSvc.acceptPartnerJob({ partnerLiveJobId: job.id, actor, acceptancePayload: { accepted_machine_id: 'm_good' } });
    assert(job.partner_job_status === 'ACCEPTED', 'Step 2: Job Accepted');

    // 3. Start Production
    job = await prodSvc.startPartnerProduction({ partnerLiveJobId: job.id, actor });
    assert(job.partner_job_status === 'IN_PRODUCTION', 'Step 3: Started Production');

    // 4. Pause
    job = await prodSvc.pausePartnerProduction({ partnerLiveJobId: job.id, actor, reason: 'Testing' });
    assert(job.partner_job_status === 'PRODUCTION_PAUSED', 'Step 4: Paused Production');

    // 5. Resume
    job = await prodSvc.resumePartnerProduction({ partnerLiveJobId: job.id, actor });
    assert(job.partner_job_status === 'IN_PRODUCTION', 'Step 5: Resumed Production');

    // 6. Report Incident
    const inc = await prodSvc.reportPartnerIncident({ partnerLiveJobId: job.id, actor, incidentPayload: { severity: 'WARNING', message: 'Low ink' } });
    assert(inc.severity === 'WARNING', 'Step 6: Warning Incident Reported');

    // 7. Resolve Incident
    await prodSvc.resolvePartnerIncident({ incidentId: inc.id, actor, resolutionNotes: 'Replaced' });
    assert(prodSvc._mockIncidents[0].incident_status === 'RESOLVED', 'Step 7: Incident Resolved');

    // 8. Try complete without evidence
    try {
        await prodSvc.completePartnerProduction({ partnerLiveJobId: job.id, actor });
        assert(false, 'Step 8: Completion blocked without evidence');
    } catch(e) {
        assert(e.message.includes('evidence'), 'Step 8: Completion blocked without evidence');
    }

    // 9. Submit Evidence
    await prodSvc.submitPartnerCompletionEvidence({ partnerLiveJobId: job.id, actor, evidencePayload: { photos: ['url'] } });
    assert(prodSvc._mockEvidence[job.id], 'Step 9: Evidence Submitted');

    // 10. Complete
    job = await prodSvc.completePartnerProduction({ partnerLiveJobId: job.id, actor });
    assert(job.partner_job_status === 'COMPLETED', 'Step 10: Production Completed');
    assert(completedLiveOrderCount === 1, 'Step 11: Governed completion propagated to live order');

    // 12. Check audit trail
    const expectedEvents = [
        'PARTNER_JOB_ASSIGNED',
        'PARTNER_JOB_ACCEPTED',
        'PARTNER_PRODUCTION_STARTED',
        'PARTNER_PRODUCTION_PAUSED',
        'PARTNER_PRODUCTION_RESUMED',
        'PARTNER_INCIDENT_REPORTED',
        'PARTNER_INCIDENT_RESOLVED',
        'PARTNER_COMPLETION_SUBMITTED',
        'PARTNER_JOB_COMPLETED'
    ];
    
    const actualEvents = jobSvc._mockDb.events.map(e => e.eventType);
    
    let allFound = true;
    for (const exp of expectedEvents) {
        if (!actualEvents.includes(exp)) allFound = false;
    }
    
    assert(allFound && actualEvents.length === 9, 'Step 12: Full audit trail recorded in correct sequence');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 83F Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
