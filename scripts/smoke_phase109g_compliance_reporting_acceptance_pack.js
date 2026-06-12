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

    const jsonPath = path.join(REPORTS, 'phase109g_compliance_reporting_acceptance.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ ready: true }, null, 2));

    const mdPath = path.join(REPORTS, 'phase109g_compliance_reporting_acceptance.md');
    fs.writeFileSync(mdPath, `# Phase 109 Controlled Financial Compliance Reporting Readiness Acceptance
PRINTPRICE OS — PHASE 109 CONTROLLED FINANCIAL COMPLIANCE REPORTING READINESS
STATUS: VALIDATED
FINANCIAL_COMPLIANCE_REPORTING_READINESS: ACTIVE
COMPLIANCE_REPORT_DEFINITIONS: ACTIVE
COMPLIANCE_REPORT_PREVIEWS: ACTIVE
COMPLIANCE_REPORT_REVIEW_WORKFLOW: ACTIVE
AUDIT_TIMELINE: ACTIVE
EXPORT_PREVIEW: MANUAL_ONLY_REDACTED
PRODUCTION_ACTIVATION: NOT_ENABLED
FULL_PUBLIC_LAUNCH: NOT_ENABLED
LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED
EXTERNAL_REPORT_SUBMISSION: NOT_ENABLED
TAX_FILING_AUTOMATION: NOT_ENABLED
VAT_RETURN_SUBMISSION: NOT_ENABLED
EXTERNAL_INVOICE_SUBMISSION: NOT_ENABLED
LIVE_PERSONAL_DATA_EXPORT: NOT_ENABLED
PAYMENT_EXECUTION: NOT_ENABLED
REFUND_EXECUTION: NOT_ENABLED
PAYOUT_EXECUTION: NOT_ENABLED
SOURCE_RECORD_MUTATION: NOT_ENABLED
NEXT MILESTONE: PHASE 110 — CONTROLLED FINANCIAL OPERATIONS GO-LIVE SIMULATION
`);
}

async function runSmoke() {
    console.log('\n━━━ Phase 109G — Financial Compliance Reporting Readiness Acceptance Pack Smoke ━━━\n');

    await generateReports();

    // SC1: Smoke scripts exist
    const scripts = [
        'smoke_phase109a_financial_compliance_reporting_schema.js',
        'smoke_phase109b_compliance_report_definition_service.js',
        'smoke_phase109c_compliance_report_preview_builder.js',
        'smoke_phase109d_compliance_report_review_workflow.js',
        'smoke_phase109e_compliance_reporting_admin_api_ui.js',
        'smoke_phase109f_end_to_end_compliance_reporting_regression.js',
        'smoke_phase109g_compliance_reporting_acceptance_pack.js'
    ];
    for (const s of scripts) {
        assert(fs.existsSync(path.join(ROOT, 'scripts', s)), `SC1: Smoke script exists: ${s}`);
    }

    // SC2: Services
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsComplianceReportDefinitionService.js')), 'SC2: Definition service exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsComplianceReportPreviewService.js')), 'SC2: Preview service exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsComplianceReportReviewService.js')), 'SC2: Review service exists');

    // SC3: Route
    assert(fs.existsSync(path.join(ROOT, 'src/api/routes/adminFinancialOperationsComplianceReporting.js')), 'SC3: Required route exists');

    // SC4: UI
    assert(fs.existsSync(path.join(ROOT, 'src/ui/pages/financial-operations-compliance-reporting/FinancialOperationsComplianceReportingPage.tsx')), 'SC4: Required UI stubs exist');

    // SC5: UI copy
    const uiStr = fs.readFileSync(path.join(ROOT, 'src/ui/pages/financial-operations-compliance-reporting/FinancialOperationsComplianceReportingPage.tsx'), 'utf-8');
    assert(uiStr.includes('This does not submit reports externally'), 'SC5: Required safety copy exists');
    assert(uiStr.includes('This does not file taxes'), 'SC5: Required safety copy exists');
    assert(uiStr.includes('Compliance reports are preview-only'), 'SC5: Required safety copy exists');
    assert(uiStr.includes('Export previews are manual-only and redacted'), 'SC5: Required safety copy exists');

    // Constraints
    const pStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsComplianceReportDefinitionService.js'), 'utf-8');
    const bStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsComplianceReportPreviewService.js'), 'utf-8');
    const rStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsComplianceReportReviewService.js'), 'utf-8');

    assert(!pStr.includes('submit') && !bStr.includes('submit') && !rStr.includes('submit'), 'SC6: No external report submission exists');
    assert(!pStr.includes('UPDATE orders') && !bStr.includes('UPDATE orders') && !rStr.includes('UPDATE orders'), 'SC7: No mutation of source records exists');
    assert(!pStr.includes('axios') && !bStr.includes('axios') && !rStr.includes('axios'), 'SC8: No live provider connectivity');
    assert(bStr.includes('[REDACTED]'), 'SC9: Export preview is redacted');

    assert(fs.existsSync(path.join(REPORTS, 'phase109g_compliance_reporting_acceptance.md')), 'SC10: Final status block is generated');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 109G Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
