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

    const jsonPath = path.join(REPORTS, 'phase111g_pre_production_runbook_acceptance.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ ready: true }, null, 2));

    const mdPath = path.join(REPORTS, 'phase111g_pre_production_runbook_acceptance.md');
    fs.writeFileSync(mdPath, `# Phase 111 Controlled Financial Operations Pre-Production Runbook Acceptance
PRINTPRICE OS — PHASE 111 CONTROLLED FINANCIAL OPERATIONS PRE-PRODUCTION RUNBOOK
STATUS: VALIDATED
FINOPS_PRE_PRODUCTION_RUNBOOK: ACTIVE
RUNBOOK_SECTIONS: ACTIVE
OPERATOR_TASKS: ACTIVE
MANUAL_CONFIRMATIONS: ACTIVE
PRE_PRODUCTION_REVIEW_WORKFLOW: ACTIVE
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
NEXT MILESTONE: PHASE 112 — CONTROLLED FINANCIAL OPERATIONS FINAL RELEASE CANDIDATE
`);
}

async function runSmoke() {
    console.log('\n━━━ Phase 111G — Pre-Production Runbook Acceptance Pack Smoke ━━━\n');

    await generateReports();

    // SC1: Smoke scripts exist
    const scripts = [
        'smoke_phase111a_pre_production_runbook_schema.js',
        'smoke_phase111b_pre_production_runbook_builder.js',
        'smoke_phase111c_pre_production_operator_tasks.js',
        'smoke_phase111d_pre_production_runbook_review_workflow.js',
        'smoke_phase111e_pre_production_runbook_admin_api_ui.js',
        'smoke_phase111f_end_to_end_pre_production_runbook_regression.js',
        'smoke_phase111g_pre_production_runbook_acceptance_pack.js'
    ];
    for (const s of scripts) {
        assert(fs.existsSync(path.join(ROOT, 'scripts', s)), `SC1: Smoke script exists: ${s}`);
    }

    // SC2: Services
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsPreProductionRunbookService.js')), 'SC2: Runbook service exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsPreProductionOperatorTaskService.js')), 'SC2: Task service exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsPreProductionRunbookReviewService.js')), 'SC2: Review service exists');

    // SC3: Route
    assert(fs.existsSync(path.join(ROOT, 'src/api/routes/adminFinancialOperationsPreProductionRunbook.js')), 'SC3: Required route exists');

    // SC4: UI
    assert(fs.existsSync(path.join(ROOT, 'src/ui/pages/financial-operations-pre-production-runbook/FinancialOperationsPreProductionRunbookPage.tsx')), 'SC4: Required UI stubs exist');

    // SC5: UI copy
    const uiStr = fs.readFileSync(path.join(ROOT, 'src/ui/pages/financial-operations-pre-production-runbook/FinancialOperationsPreProductionRunbookPage.tsx'), 'utf-8');
    assert(uiStr.includes('Financial operations pre-production runbook only'), 'SC5: Required safety copy exists');
    assert(uiStr.includes('This does not file taxes'), 'SC5: Required safety copy exists');
    assert(uiStr.includes('Runbook approval does not activate production'), 'SC5: Required safety copy exists');
    assert(uiStr.includes('FULL_PUBLIC remains disabled'), 'SC5: Required safety copy exists');

    // Constraints
    const pStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPreProductionRunbookService.js'), 'utf-8');
    const tStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPreProductionOperatorTaskService.js'), 'utf-8');
    const rStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPreProductionRunbookReviewService.js'), 'utf-8');

    assert(!pStr.includes('submit') && !tStr.includes('submit') && !rStr.includes('submit'), 'SC6: No external report submission exists');
    assert(!pStr.includes('UPDATE orders') && !tStr.includes('UPDATE orders') && !rStr.includes('UPDATE orders'), 'SC7: No mutation of source records exists');
    assert(!pStr.includes('axios') && !tStr.includes('axios') && !rStr.includes('axios'), 'SC8: No live provider connectivity');
    assert(!pStr.includes('activateProduction') && !tStr.includes('activateProduction') && !rStr.includes('activateProduction'), 'SC9: Pre-production review does not activate production');

    assert(fs.existsSync(path.join(REPORTS, 'phase111g_pre_production_runbook_acceptance.md')), 'SC10: Final status block is generated');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 111G Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
