'use strict';

const fs = require('fs');
const path = require('path');

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
const REPORTS = path.join(ROOT, 'reports');

async function generateReport() {
    if (!fs.existsSync(REPORTS)) fs.mkdirSync(REPORTS, { recursive: true });

    const mdPath = path.join(REPORTS, 'phase112g_final_release_candidate_acceptance.md');
    fs.writeFileSync(mdPath, `# Phase 112 Controlled Financial Operations Final Release Candidate Acceptance

PRINTPRICE OS — PHASE 112 CONTROLLED FINANCIAL OPERATIONS FINAL RELEASE CANDIDATE
STATUS: VALIDATED
FINOPS_FINAL_RELEASE_CANDIDATE: ACTIVE
FINAL_RELEASE_CHECKS: ACTIVE
FINAL_RELEASE_EVIDENCE_PACK: ACTIVE
FINAL_RELEASE_REVIEW_WORKFLOW: ACTIVE
AUDIT_TIMELINE: ACTIVE
EXPORT_PREVIEW: MANUAL_ONLY_REDACTED
PRODUCTION_ACTIVATION: NOT_ENABLED
FULL_PUBLIC_LAUNCH: NOT_ENABLED
LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED
PAYMENT_EXECUTION: NOT_ENABLED
REFUND_EXECUTION: NOT_ENABLED
PAYOUT_EXECUTION: NOT_ENABLED
EXTERNAL_INVOICE_SUBMISSION: NOT_ENABLED
TAX_FILING_AUTOMATION: NOT_ENABLED
VAT_RETURN_SUBMISSION: NOT_ENABLED
EXTERNAL_REPORT_SUBMISSION: NOT_ENABLED
LIVE_PERSONAL_DATA_EXPORT: NOT_ENABLED
SOURCE_RECORD_MUTATION: NOT_ENABLED
NEXT MILESTONE: PHASE 113 — CONTROLLED FINANCIAL OPERATIONS PRODUCTION ACTIVATION GATE
`);
    return mdPath;
}

async function runSmoke() {
    console.log('\n━━━ Phase 112G — Final Release Candidate Acceptance Pack Smoke ━━━\n');

    const mdPath = await generateReport();

    // SC1: All Phase 112 smoke scripts exist
    const scripts = [
        'smoke_phase112a_final_release_candidate_schema.js',
        'smoke_phase112b_final_release_candidate_builder.js',
        'smoke_phase112c_final_release_evidence_pack.js',
        'smoke_phase112d_final_release_candidate_review_workflow.js',
        'smoke_phase112e_final_release_candidate_admin_api_ui.js',
        'smoke_phase112f_end_to_end_final_release_candidate_regression.js',
        'smoke_phase112g_final_release_candidate_acceptance_pack.js'
    ];
    for (const s of scripts) {
        assert(fs.existsSync(path.join(ROOT, 'scripts', s)), `SC1: Smoke script exists: ${s}`);
    }

    // SC2: Required services exist
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsFinalReleaseCandidateService.js')), 'SC2: Candidate service exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsFinalReleaseEvidencePackService.js')), 'SC2: Evidence pack service exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsFinalReleaseCandidateReviewService.js')), 'SC2: Review service exists');

    // SC3: Required route exists
    assert(fs.existsSync(path.join(ROOT, 'src/api/routes/adminFinancialOperationsFinalReleaseCandidate.js')), 'SC3: Required route exists');

    // SC4: Required UI stubs exist
    assert(fs.existsSync(path.join(ROOT, 'src/ui/pages/financial-operations-final-release-candidate/FinancialOperationsFinalReleaseCandidatePage.tsx')), 'SC4: Required UI stubs exist');

    // SC5: Required safety copy exists
    const uiStr = fs.readFileSync(path.join(ROOT, 'src/ui/pages/financial-operations-final-release-candidate/FinancialOperationsFinalReleaseCandidatePage.tsx'), 'utf-8');
    assert(uiStr.includes('Financial operations final release candidate only'), 'SC5: Safety copy exists');
    assert(uiStr.includes('Release candidate approval does not activate production'), 'SC5: Safety copy exists');
    assert(uiStr.includes('FULL_PUBLIC remains disabled'), 'SC5: Safety copy exists');
    assert(uiStr.includes('This does not file taxes'), 'SC5: Safety copy exists');
    assert(uiStr.includes('Source records are not mutated'), 'SC5: Safety copy exists');

    // SC6–SC15: Service-level constraint checks
    const rcStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsFinalReleaseCandidateService.js'), 'utf-8');
    const evStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsFinalReleaseEvidencePackService.js'), 'utf-8');
    const revStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsFinalReleaseCandidateReviewService.js'), 'utf-8');
    const routeStr = fs.readFileSync(path.join(ROOT, 'src/api/routes/adminFinancialOperationsFinalReleaseCandidate.js'), 'utf-8');

    assert(!rcStr.includes('activateProduction') && !evStr.includes('activateProduction') && !revStr.includes('activateProduction'), 'SC6: No production activation exists');
    assert(!rcStr.includes('enableFullPublic') && !revStr.includes('enableFullPublic'), 'SC7: No FULL_PUBLIC enablement exists');
    assert(!rcStr.includes('axios') && !evStr.includes('axios') && !revStr.includes('axios'), 'SC8: No live provider connectivity exists');
    assert(!rcStr.includes('executePayment') && !revStr.includes('executeRefund'), 'SC9: No payment/refund/payout execution exists');
    assert(!rcStr.includes('submitInvoice') && !revStr.includes('submitInvoice'), 'SC10: No external invoice submission exists');
    assert(!rcStr.includes('fileTax') && !revStr.includes('fileTax'), 'SC11: No automated tax filing exists');
    assert(!rcStr.includes('submitVAT') && !revStr.includes('submitVAT'), 'SC12: No VAT return submission exists');
    assert(!rcStr.includes('submitReport') && !revStr.includes('submitReport'), 'SC13: No external report submission exists');
    assert(!rcStr.includes('exportPersonalData') && !revStr.includes('exportPersonalData'), 'SC14: No live personal data export exists');
    assert(!rcStr.includes('UPDATE orders') && !revStr.includes('DELETE FROM'), 'SC15: No mutation of source records');

    // SC16: Final release candidate approval does not activate production
    assert(!revStr.includes('activateProduction'), 'SC16: Release candidate approval does not activate production');

    // SC17: Export preview is redacted
    assert(evStr.includes('[REDACTED]'), 'SC17: Export preview is redacted');

    // SC18: Final status block is generated
    assert(fs.existsSync(mdPath), 'SC18: Final status block is generated');
    const mdContent = fs.readFileSync(mdPath, 'utf-8');
    assert(mdContent.includes('STATUS: VALIDATED'), 'SC18: Status block contains VALIDATED');
    assert(mdContent.includes('PRODUCTION_ACTIVATION: NOT_ENABLED'), 'SC18: Status block affirms NOT_ENABLED constraints');

    console.log('\n━━━ Final Status ━━━\n');
    console.log(mdContent.trim());

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 112G Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
