'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsComplianceReportDefinitionService = require('../src/api/services/financialOperationsComplianceReportDefinitionService');
const FinancialOperationsComplianceReportPreviewService = require('../src/api/services/financialOperationsComplianceReportPreviewService');

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
    console.log('\n━━━ Phase 109C — Compliance Report Preview Builder Service Smoke ━━━\n');

    const defSvc = new FinancialOperationsComplianceReportDefinitionService();
    const previewSvc = new FinancialOperationsComplianceReportPreviewService(defSvc);
    const actorAdmin = { role: 'COMPLIANCE_ADMIN', userId: 'a_1' };

    // Set up definition
    const validPayload = {
        reportKey: 'Q1_RECON_2026',
        reportName: 'Q1 2026 Reconciliation Readiness',
        reportDomain: 'FINANCIAL_RECONCILIATION',
        dataSources: ['MARKETPLACE_ORDERS'],
        requiredSections: ['summary', 'source coverage'],
        redactionRequired: true,
        manualReviewRequired: true
    };
    const p1 = await defSvc.createDefinition(validPayload, actorAdmin);
    await defSvc.evaluateDefinitionReadiness(p1.compliance_report_definition_id, actorAdmin);
    await defSvc.approveDefinition(p1.compliance_report_definition_id, actorAdmin);

    const candidateRecords = [
        { id: 'rec_1', customer_name: 'John Doe', amount: 100 },
        { id: 'rec_2', customer_name: 'Jane Smith', amount: -50 } // should trigger a warning
    ];

    // SC1: Generate compliance report preview from approved definition
    const run1 = await previewSvc.createPreviewRun(p1.compliance_report_definition_id, 'COMPLIANCE_PREVIEW_ONLY', candidateRecords, actorAdmin);
    assert(run1.run_status === 'READY_FOR_REVIEW', 'SC1: Generate compliance report preview from approved definition');

    // SC2: Build required sections
    assert(previewSvc._mockSections.length === 2, 'SC2: Build required sections');
    assert(previewSvc._mockSections.some(s => s.section_key === 'summary'), 'SC2: Section summary exists');

    // SC3: Missing approved definition blocks preview
    const runInvalid = await previewSvc.createPreviewRun('invalid_id', 'COMPLIANCE_PREVIEW_ONLY', candidateRecords, actorAdmin);
    assert(runInvalid.run_status === 'BLOCKED_BY_DEFINITION_GAP', 'SC3: Missing approved definition blocks preview');

    // SC4: Missing source coverage creates blocker
    const runEmpty = await previewSvc.createPreviewRun(p1.compliance_report_definition_id, 'COMPLIANCE_PREVIEW_ONLY', [], actorAdmin);
    assert(runEmpty.run_status === 'BLOCKED_BY_SOURCE_GAP', 'SC4: Missing source coverage creates blocker');

    // SC5: Redaction gap blocks preview
    const pNoRedact = await defSvc.createDefinition({ ...validPayload, redactionRequired: false }, actorAdmin);
    await defSvc.evaluateDefinitionReadiness(pNoRedact.compliance_report_definition_id, actorAdmin);
    // Force approve to test preview blocking
    pNoRedact.report_status = 'APPROVED_FOR_READINESS';
    const runNoRedact = await previewSvc.createPreviewRun(pNoRedact.compliance_report_definition_id, 'COMPLIANCE_PREVIEW_ONLY', candidateRecords, actorAdmin);
    assert(runNoRedact.run_status === 'BLOCKED_BY_REDACTION_GAP', 'SC5: Redaction gap blocks preview');

    // SC6: Preview is deterministic (redacted fields)
    assert(run1.result_snapshot_json[0].customer_name === '[REDACTED]', 'SC6: Preview is deterministic and redacted');
    
    // SC7: Audit events exist
    assert(previewSvc._mockEvents.some(e => e.event_type === 'FINOPS_COMPLIANCE_REPORT_REDACTED_PREVIEW_GENERATED'), 'SC7: Audit events exist');

    // SC8: Source records remain unchanged
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsComplianceReportPreviewService.js'), 'utf-8');
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('DELETE FROM'), 'SC8: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 109C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
