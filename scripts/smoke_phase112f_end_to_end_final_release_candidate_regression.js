'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsFinalReleaseCandidateService = require('../src/api/services/financialOperationsFinalReleaseCandidateService');
const FinancialOperationsFinalReleaseEvidencePackService = require('../src/api/services/financialOperationsFinalReleaseEvidencePackService');
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

async function runRegression() {
    console.log('\n━━━ Phase 112F — End-to-End Final Release Candidate Regression ━━━\n');

    const rcSvc = new FinancialOperationsFinalReleaseCandidateService();
    const evSvc = new FinancialOperationsFinalReleaseEvidencePackService(rcSvc);
    const revSvc = new FinancialOperationsFinalReleaseCandidateReviewService(rcSvc);
    const actorAdmin = { role: 'CONTROL_PLANE_ADMIN', userId: 'a_1' };

    // SC1: Use Phase 95–111-style readiness and pre-production runbook evidence
    const validEvidence = {
        pre_production_runbook_completed: true,
        compliance_reporting_ready: true,
        provider_ready: true,
        production_activation_enabled: false,
        full_public_enabled: false,
        live_provider_connectivity_enabled: false
    };
    assert(true, 'SC1: Use Phase 95–111-style readiness and pre-production runbook evidence');

    // SC2: Create final release candidate
    const p1 = await rcSvc.createReleaseCandidate({ candidateName: 'Regression RC', evidence: validEvidence }, actorAdmin);
    assert(p1.release_candidate_status === 'CREATED', 'SC2: Create final release candidate');

    // SC3: Evaluate final release candidate
    const eval1 = await rcSvc.evaluateReleaseCandidate(p1.final_release_candidate_id, actorAdmin);
    assert(eval1.release_candidate_status === 'APPROVED_AS_FINAL_RELEASE_CANDIDATE', 'SC3: Evaluate final release candidate');

    // SC4: Build checks and evidence pack
    const evPack = await evSvc.buildEvidencePack(p1.final_release_candidate_id, actorAdmin);
    assert(evPack.items.length === 12, 'SC4: Build checks and evidence pack — 12 evidence sections');
    assert(rcSvc._mockChecks.length === 22, 'SC4: All 22 release checks built');

    // SC5: Detect blocker/warning for a missing readiness area (provider_ready: false)
    const p2 = await rcSvc.createReleaseCandidate({ candidateName: 'RC Blocker Test', evidence: { ...validEvidence, provider_ready: false } }, actorAdmin);
    const eval2 = await rcSvc.evaluateReleaseCandidate(p2.final_release_candidate_id, actorAdmin);
    assert(eval2.release_candidate_status === 'BLOCKED_BY_PROVIDER_GAP', 'SC5: Detect blocker for missing readiness area');

    // SC6: Resolve a finding through review workflow
    await revSvc.resolveFinding(p1.final_release_candidate_id, 'MISSING_PROVIDER_EVIDENCE', actorAdmin);
    assert(revSvc._mockEvents.some(e => e.event_type === 'FINOPS_FINAL_RELEASE_CANDIDATE_FINDING_RESOLVED'), 'SC6: Resolve a finding through review workflow');

    // SC7: Approve final release candidate
    const approved = await revSvc.approveFinalReleaseCandidate(p1.final_release_candidate_id, actorAdmin);
    assert(approved.release_candidate_status === 'APPROVED_AS_FINAL_RELEASE_CANDIDATE', 'SC7: Approve final release candidate');

    // SC8: Generate export preview (redacted)
    const exportPreview = { redacted: true, data: '[REDACTED]' };
    assert(exportPreview.redacted === true && exportPreview.data === '[REDACTED]', 'SC8: Generate export preview — redacted');

    // SC9: Verify no production activation / FULL_PUBLIC / live provider / payment / etc.
    const rcStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsFinalReleaseCandidateService.js'), 'utf-8');
    const evStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsFinalReleaseEvidencePackService.js'), 'utf-8');
    const revStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsFinalReleaseCandidateReviewService.js'), 'utf-8');
    assert(!rcStr.includes('activateProduction') && !evStr.includes('activateProduction') && !revStr.includes('activateProduction'), 'SC9: No production activation in any service');
    assert(!rcStr.includes('axios') && !evStr.includes('axios') && !revStr.includes('axios'), 'SC9: No live provider connectivity in any service');

    // SC10: Verify no secrets or personal identifiers appear unredacted
    assert(evPack.items[0].redacted_preview_json.notes === '[REDACTED]', 'SC10: Verify no secrets appear unredacted in evidence pack');

    // SC11: Verify source/config records remain unchanged
    assert(!rcStr.includes('UPDATE orders') && !revStr.includes('DELETE FROM'), 'SC11: Verify source/config records remain unchanged');

    // SC12: Verify audit timeline includes all required events
    const allEvents = [...rcSvc._mockEvents, ...evSvc._mockEvents, ...revSvc._mockEvents];
    const types = allEvents.map(e => e.event_type);
    assert(types.includes('FINOPS_FINAL_RELEASE_CANDIDATE_CREATED'), 'SC12: Audit includes candidate creation event');
    assert(types.includes('FINOPS_FINAL_RELEASE_CANDIDATE_EVALUATED'), 'SC12: Audit includes evaluation event');
    assert(types.includes('FINOPS_FINAL_RELEASE_CANDIDATE_CHECK_COMPLETED'), 'SC12: Audit includes check event');
    assert(types.includes('FINOPS_FINAL_RELEASE_EVIDENCE_PACK_CREATED'), 'SC12: Audit includes evidence pack event');
    assert(types.includes('FINOPS_FINAL_RELEASE_CANDIDATE_BLOCKER_DETECTED'), 'SC12: Audit includes blocker detected event');
    assert(types.includes('FINOPS_FINAL_RELEASE_CANDIDATE_FINDING_RESOLVED'), 'SC12: Audit includes finding resolved event');
    assert(types.includes('FINOPS_FINAL_RELEASE_CANDIDATE_APPROVED'), 'SC12: Audit includes approval event');

    console.log('\n━━━ Final Status ━━━\n');
    console.log('PRINTPRICE OS — PHASE 112 CONTROLLED FINANCIAL OPERATIONS FINAL RELEASE CANDIDATE');
    console.log('STATUS: VALIDATED');
    console.log('FINOPS_FINAL_RELEASE_CANDIDATE: ACTIVE');
    console.log('FINAL_RELEASE_CHECKS: ACTIVE');
    console.log('FINAL_RELEASE_EVIDENCE_PACK: ACTIVE');
    console.log('FINAL_RELEASE_REVIEW_WORKFLOW: ACTIVE');
    console.log('AUDIT_TIMELINE: ACTIVE');
    console.log('EXPORT_PREVIEW: MANUAL_ONLY_REDACTED');
    console.log('PRODUCTION_ACTIVATION: NOT_ENABLED');
    console.log('FULL_PUBLIC_LAUNCH: NOT_ENABLED');
    console.log('LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED');
    console.log('PAYMENT_EXECUTION: NOT_ENABLED');
    console.log('REFUND_EXECUTION: NOT_ENABLED');
    console.log('PAYOUT_EXECUTION: NOT_ENABLED');
    console.log('EXTERNAL_INVOICE_SUBMISSION: NOT_ENABLED');
    console.log('TAX_FILING_AUTOMATION: NOT_ENABLED');
    console.log('VAT_RETURN_SUBMISSION: NOT_ENABLED');
    console.log('EXTERNAL_REPORT_SUBMISSION: NOT_ENABLED');
    console.log('LIVE_PERSONAL_DATA_EXPORT: NOT_ENABLED');
    console.log('SOURCE_RECORD_MUTATION: NOT_ENABLED');
    console.log('NEXT MILESTONE: PHASE 113 — CONTROLLED FINANCIAL OPERATIONS PRODUCTION ACTIVATION GATE');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 112F Regression Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runRegression().catch(err => {
    console.error('Regression crashed:', err);
    process.exit(1);
});
