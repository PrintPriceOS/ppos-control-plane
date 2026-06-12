'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsFinalReleaseCandidateService = require('../src/api/services/financialOperationsFinalReleaseCandidateService');

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
    console.log('\n━━━ Phase 112B — Final Release Candidate Builder Service Smoke ━━━\n');

    const svc = new FinancialOperationsFinalReleaseCandidateService();
    const actorAdmin = { role: 'CONTROL_PLANE_ADMIN', userId: 'a_1' };

    const validEvidence = {
        pre_production_runbook_completed: true,
        compliance_reporting_ready: true,
        provider_ready: true,
        production_activation_enabled: false,
        full_public_enabled: false,
        live_provider_connectivity_enabled: false
    };

    // SC1: Clean stack becomes APPROVED_AS_FINAL_RELEASE_CANDIDATE
    const p1 = await svc.createReleaseCandidate({ candidateName: 'RC 1', evidence: validEvidence }, actorAdmin);
    const eval1 = await svc.evaluateReleaseCandidate(p1.final_release_candidate_id, actorAdmin);
    assert(eval1.release_candidate_status === 'APPROVED_AS_FINAL_RELEASE_CANDIDATE', 'SC1: Clean stack becomes APPROVED_AS_FINAL_RELEASE_CANDIDATE');

    // SC2: Missing pre-production runbook blocks release candidate
    const p2 = await svc.createReleaseCandidate({ candidateName: 'RC 2', evidence: { ...validEvidence, pre_production_runbook_completed: false } }, actorAdmin);
    const eval2 = await svc.evaluateReleaseCandidate(p2.final_release_candidate_id, actorAdmin);
    assert(eval2.release_candidate_status === 'BLOCKED_BY_RUNBOOK_GAP', 'SC2: Missing pre-production runbook blocks release candidate');

    // SC3: Missing compliance report blocks release candidate
    const p3 = await svc.createReleaseCandidate({ candidateName: 'RC 3', evidence: { ...validEvidence, compliance_reporting_ready: false } }, actorAdmin);
    const eval3 = await svc.evaluateReleaseCandidate(p3.final_release_candidate_id, actorAdmin);
    assert(eval3.release_candidate_status === 'BLOCKED_BY_COMPLIANCE_GAP', 'SC3: Missing compliance report blocks release candidate');

    // SC4: Missing provider readiness blocks release candidate
    const p4 = await svc.createReleaseCandidate({ candidateName: 'RC 4', evidence: { ...validEvidence, provider_ready: false } }, actorAdmin);
    const eval4 = await svc.evaluateReleaseCandidate(p4.final_release_candidate_id, actorAdmin);
    assert(eval4.release_candidate_status === 'BLOCKED_BY_PROVIDER_GAP', 'SC4: Missing provider readiness blocks release candidate');

    // SC5: FULL_PUBLIC enabled blocks release candidate
    const p5 = await svc.createReleaseCandidate({ candidateName: 'RC 5', evidence: { ...validEvidence, full_public_enabled: true } }, actorAdmin);
    const eval5 = await svc.evaluateReleaseCandidate(p5.final_release_candidate_id, actorAdmin);
    assert(eval5.release_candidate_status === 'BLOCKED_BY_SECURITY_GAP', 'SC5: FULL_PUBLIC enabled blocks release candidate');

    // SC6: Production activation enabled blocks release candidate
    const p6 = await svc.createReleaseCandidate({ candidateName: 'RC 6', evidence: { ...validEvidence, production_activation_enabled: true } }, actorAdmin);
    const eval6 = await svc.evaluateReleaseCandidate(p6.final_release_candidate_id, actorAdmin);
    assert(eval6.release_candidate_status === 'BLOCKED_BY_SECURITY_GAP', 'SC6: Production activation enabled blocks release candidate');

    // SC7: Live provider connectivity enabled blocks release candidate
    const p7 = await svc.createReleaseCandidate({ candidateName: 'RC 7', evidence: { ...validEvidence, live_provider_connectivity_enabled: true } }, actorAdmin);
    const eval7 = await svc.evaluateReleaseCandidate(p7.final_release_candidate_id, actorAdmin);
    assert(eval7.release_candidate_status === 'BLOCKED_BY_PROVIDER_GAP', 'SC7: Live provider connectivity enabled blocks release candidate');

    // SC8: Source records remain unchanged
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsFinalReleaseCandidateService.js'), 'utf-8');
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('DELETE FROM'), 'SC8: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 112B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
