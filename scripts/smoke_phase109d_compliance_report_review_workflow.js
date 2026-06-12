'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsComplianceReportDefinitionService = require('../src/api/services/financialOperationsComplianceReportDefinitionService');
const FinancialOperationsComplianceReportPreviewService = require('../src/api/services/financialOperationsComplianceReportPreviewService');
const FinancialOperationsComplianceReportReviewService = require('../src/api/services/financialOperationsComplianceReportReviewService');

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
    console.log('\n━━━ Phase 109D — Compliance Report Review Workflow Service Smoke ━━━\n');

    const defSvc = new FinancialOperationsComplianceReportDefinitionService();
    const previewSvc = new FinancialOperationsComplianceReportPreviewService(defSvc);
    const reviewSvc = new FinancialOperationsComplianceReportReviewService(defSvc, previewSvc);
    const actorAdmin = { role: 'COMPLIANCE_ADMIN', userId: 'a_1' };

    const validPayload = {
        reportKey: 'Q1_RECON_2026',
        reportName: 'Q1 2026 Reconciliation Readiness',
        reportDomain: 'FINANCIAL_RECONCILIATION',
        dataSources: ['MARKETPLACE_ORDERS'],
        requiredSections: ['summary'],
        redactionRequired: true,
        manualReviewRequired: true
    };
    const p1 = await defSvc.createDefinition(validPayload, actorAdmin);
    await defSvc.evaluateDefinitionReadiness(p1.compliance_report_definition_id, actorAdmin);
    await defSvc.approveDefinition(p1.compliance_report_definition_id, actorAdmin);

    const candidateRecords = [{ id: 'rec_1', customer_name: 'John Doe', amount: 100 }];
    const run1 = await previewSvc.createPreviewRun(p1.compliance_report_definition_id, 'COMPLIANCE_PREVIEW_ONLY', candidateRecords, actorAdmin);

    // SC1: Report run approval does not submit externally
    const appRun = await reviewSvc.approveReportRun(run1.compliance_report_run_id, actorAdmin);
    assert(appRun.run_status === 'APPROVED_FOR_READINESS', 'SC1.1: Run is APPROVED_FOR_READINESS');
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsComplianceReportReviewService.js'), 'utf-8');
    assert(!sourceStr.includes('axios') && !sourceStr.includes('submit'), 'SC1.2: Report run approval does not submit externally');

    // SC2: Report approval does not file taxes
    assert(!sourceStr.includes('tax'), 'SC2: Report approval does not file taxes');

    // SC3: Finding resolution is audited
    await reviewSvc.resolveFinding(run1.compliance_report_run_id, 'MISSING_EVIDENCE', actorAdmin);
    assert(reviewSvc._mockEvents.some(e => e.event_type === 'FINOPS_COMPLIANCE_REPORT_FINDING_RESOLVED'), 'SC3: Finding resolution is audited');

    // SC4: Warning dismissal is audited
    await reviewSvc.dismissWarning(run1.compliance_report_run_id, 'Negative amount in record rec_2', actorAdmin);
    assert(reviewSvc._mockEvents.some(e => e.event_type === 'FINOPS_COMPLIANCE_REPORT_WARNING_DISMISSED'), 'SC4: Warning dismissal is audited');

    // SC5: Additional evidence request is audited
    await reviewSvc.requestAdditionalEvidence(run1.compliance_report_run_id, 'Please attach bank statement', actorAdmin);
    assert(reviewSvc._mockEvents.some(e => e.event_type === 'FINOPS_COMPLIANCE_REPORT_REVIEW_NOTE_ADDED'), 'SC5: Additional evidence request is audited');

    // SC6: Source records remain unchanged
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('DELETE FROM'), 'SC6: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 109D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
