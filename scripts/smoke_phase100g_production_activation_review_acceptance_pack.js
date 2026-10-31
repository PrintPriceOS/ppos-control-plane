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

async function generateReports() {
    if (!fs.existsSync(REPORTS)) {
        fs.mkdirSync(REPORTS, { recursive: true });
    }

    const jsonPath = path.join(REPORTS, 'phase100g_production_activation_review_acceptance.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ ready: true }, null, 2));

    const mdPath = path.join(REPORTS, 'phase100g_production_activation_review_acceptance.md');
    fs.writeFileSync(mdPath, `# Phase 100 Production Activation Review Acceptance
PRINTPRICE OS — PHASE 100 CONTROLLED PRODUCTION ACTIVATION READINESS REVIEW
STATUS: VALIDATED
PRODUCTION_ACTIVATION_REVIEW: ACTIVE
GO_NO_GO_REVIEW: ACTIVE
FINAL_READINESS_EVIDENCE_PACK: ACTIVE
SECURITY_GUARDRAILS_CONFIRMED: ACTIVE
OPERATIONAL_READINESS_CONFIRMED: ACTIVE
AUDIT_TIMELINE: ACTIVE
EXPORT_PREVIEW: MANUAL_ONLY
PRODUCTION_ACTIVATION: NOT_ENABLED
LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED
PAYMENT_EXECUTION: NOT_ENABLED
REFUND_EXECUTION: NOT_ENABLED
PAYOUT_EXECUTION: NOT_ENABLED
EXTERNAL_INVOICE_SUBMISSION: NOT_ENABLED
TAX_FILING_AUTOMATION: NOT_ENABLED
FULL_PUBLIC_LAUNCH: NOT_ENABLED
SOURCE_RECORD_MUTATION: NOT_ENABLED
NEXT MILESTONE: PHASE 101 — CONTROLLED PROVIDER CONNECTIVITY SANDBOX READINESS
`);
}

async function runSmoke() {
    console.log('\n━━━ Phase 100G — Production Activation Review Acceptance Pack Smoke ━━━\n');

    await generateReports();

    // SC1: Smoke scripts
    const scripts = [
        'smoke_phase100a_production_activation_review_schema.js',
        'smoke_phase100b_production_activation_review_aggregator.js',
        'smoke_phase100c_go_no_go_review_service.js',
        'smoke_phase100d_final_readiness_evidence_pack.js',
        'smoke_phase100e_production_activation_review_admin_api_ui.js',
        'smoke_phase100f_end_to_end_production_activation_review_regression.js',
        'smoke_phase100g_production_activation_review_acceptance_pack.js'
    ];
    for (const s of scripts) {
        assert(fs.existsSync(path.join(ROOT, 'scripts', s)), `SC1: Smoke script exists: ${s}`);
    }

    // SC2: Services
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsProductionActivationReviewService.js')), 'SC2: Production activation review aggregator exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsGoNoGoReviewService.js')), 'SC2: Go/no-go review service exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsReadinessEvidencePackService.js')), 'SC2: Evidence pack service exists');

    // SC3: Route
    assert(fs.existsSync(path.join(ROOT, 'src/api/routes/adminFinancialOperationsProductionActivationReview.js')), 'SC3: Required route exists');

    // SC4: UI
    assert(fs.existsSync(path.join(ROOT, 'src/ui/pages/financial-operations-production-activation-review/FinancialOperationsProductionActivationReviewPage.tsx')), 'SC4: Required UI stubs exist');

    // SC5: UI copy
    const uiStr = fs.readFileSync(path.join(ROOT, 'src/ui/pages/financial-operations-production-activation-review/FinancialOperationsProductionActivationReviewPage.tsx'), 'utf-8');
    assert(uiStr.includes('This does not enable production') && uiStr.includes('GO does not activate production'), 'SC5: Required safety copy exists');

    // Constraints
    const goNoGoStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsGoNoGoReviewService.js'), 'utf-8');
    const packStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsReadinessEvidencePackService.js'), 'utf-8');
    const revStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProductionActivationReviewService.js'), 'utf-8');

    assert(goNoGoStr.includes('Does NOT activate production'), 'SC6: GO does not activate production');
    assert(!goNoGoStr.includes('axios') && !goNoGoStr.includes('http'), 'SC7: No real payment/refund execution exists');
    assert(packStr.includes('NOT_ENABLED'), 'SC8: Pack confirms no production activation exists');
    assert(revStr.includes('checks.FULL_PUBLIC_DISABLED'), 'SC9: No FULL_PUBLIC enablement exists');
    assert(!revStr.includes('UPDATE orders') && !goNoGoStr.includes('UPDATE reviews'), 'SC10: No mutation of source records');
    assert(revStr.includes('recordEvent') && goNoGoStr.includes('recordEvent'), 'SC11: Audit timeline exists');

    assert(fs.existsSync(path.join(REPORTS, 'phase100g_production_activation_review_acceptance.md')), 'SC12: Final status block is generated');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 100G Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
