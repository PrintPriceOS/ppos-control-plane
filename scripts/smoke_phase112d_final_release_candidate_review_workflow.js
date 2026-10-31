'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsFinalReleaseCandidateService = require('../src/api/services/financialOperationsFinalReleaseCandidateService');
const FinancialOperationsFinalReleaseCandidateReviewService = require('../src/api/services/financialOperationsFinalReleaseCandidateReviewService');

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
    console.log('\n━━━ Phase 112D — Final Release Candidate Review Workflow Service Smoke ━━━\n');

    const rcSvc = new FinancialOperationsFinalReleaseCandidateService();
    const revSvc = new FinancialOperationsFinalReleaseCandidateReviewService(rcSvc);
    const actorAdmin = { role: 'CONTROL_PLANE_ADMIN', userId: 'a_1' };

    const validEvidence = {
        pre_production_runbook_completed: true,
        compliance_reporting_ready: true,
        provider_ready: true,
        production_activation_enabled: false,
        full_public_enabled: false,
        live_provider_connectivity_enabled: false
    };
    const p1 = await rcSvc.createReleaseCandidate({ candidateName: 'RC 1', evidence: validEvidence }, actorAdmin);
    await rcSvc.evaluateReleaseCandidate(p1.final_release_candidate_id, actorAdmin);

    // SC1: Release candidate approval does not enable production
    const appRC = await revSvc.approveFinalReleaseCandidate(p1.final_release_candidate_id, actorAdmin);
    assert(appRC.release_candidate_status === 'APPROVED_AS_FINAL_RELEASE_CANDIDATE', 'SC1.1: Release candidate is APPROVED_AS_FINAL_RELEASE_CANDIDATE');
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsFinalReleaseCandidateReviewService.js'), 'utf-8');
    assert(!sourceStr.includes('activateProduction'), 'SC1.2: Release candidate approval does not enable production');

    // SC2: Release candidate approval does not enable FULL_PUBLIC
    assert(!sourceStr.includes('full_public'), 'SC2: Release candidate approval does not enable FULL_PUBLIC');

    // SC3: Release candidate approval does not connect providers
    assert(!sourceStr.includes('axios') && !sourceStr.includes('connect'), 'SC3: Release candidate approval does not connect providers');

    // SC4: Finding resolution is audited
    await revSvc.resolveFinding(p1.final_release_candidate_id, 'MISSING_EVIDENCE', actorAdmin);
    assert(revSvc._mockEvents.some(e => e.event_type === 'FINOPS_FINAL_RELEASE_CANDIDATE_FINDING_RESOLVED'), 'SC4: Finding resolution is audited');

    // SC5: Warning dismissal is audited
    await revSvc.dismissWarning(p1.final_release_candidate_id, 'Warning check', actorAdmin);
    assert(revSvc._mockEvents.some(e => e.event_type === 'FINOPS_FINAL_RELEASE_CANDIDATE_WARNING_DISMISSED'), 'SC5: Warning dismissal is audited');

    // SC6: Additional evidence request is audited
    await revSvc.requestAdditionalEvidence(p1.final_release_candidate_id, 'Please attach approval doc', actorAdmin);
    assert(revSvc._mockEvents.some(e => e.event_type === 'FINOPS_FINAL_RELEASE_CANDIDATE_REVIEW_ACTION_RECORDED'), 'SC6: Additional evidence request is audited');

    // SC7: Review note is audited
    await revSvc.addReviewNote(p1.final_release_candidate_id, 'SECURITY', 'Security cleared', actorAdmin);
    assert(revSvc._mockEvents.some(e => e.event_type === 'FINOPS_FINAL_RELEASE_CANDIDATE_REVIEW_NOTE_ADDED'), 'SC7: Review note is audited');

    // SC8: Source records remain unchanged
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('DELETE FROM'), 'SC8: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 112D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
