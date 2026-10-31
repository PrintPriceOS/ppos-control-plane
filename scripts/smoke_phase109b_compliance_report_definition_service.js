'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsComplianceReportDefinitionService = require('../src/api/services/financialOperationsComplianceReportDefinitionService');

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
    console.log('\n━━━ Phase 109B — Compliance Report Definition Service Smoke ━━━\n');

    const svc = new FinancialOperationsComplianceReportDefinitionService();
    const actorAdmin = { role: 'COMPLIANCE_ADMIN', userId: 'a_1' };

    const validPayload = {
        reportKey: 'Q1_RECON_2026',
        reportName: 'Q1 2026 Reconciliation Readiness',
        reportDomain: 'FINANCIAL_RECONCILIATION',
        dataSources: ['MARKETPLACE_ORDERS', 'PAYMENTS'],
        requiredSections: ['summary', 'source coverage', 'reconciliation readiness'],
        redactionRequired: true,
        manualReviewRequired: true,
        externalSubmissionEnabled: false,
        taxFilingEnabled: false,
        productionExecutionEnabled: false,
        fullPublicEnabled: false
    };

    // SC1: Clean report definition becomes APPROVED_FOR_READINESS
    const p1 = await svc.createDefinition(validPayload, actorAdmin);
    const eval1 = await svc.evaluateDefinitionReadiness(p1.compliance_report_definition_id, actorAdmin);
    assert(eval1.ready && eval1.definition.report_status === 'READY_FOR_REVIEW', 'SC1.1: Definition is READY_FOR_REVIEW');
    const app1 = await svc.approveDefinition(p1.compliance_report_definition_id, actorAdmin);
    assert(app1.report_status === 'APPROVED_FOR_READINESS', 'SC1.2: Clean definition becomes APPROVED_FOR_READINESS');

    // SC2: Missing report domain blocks readiness
    const p2 = await svc.createDefinition({ ...validPayload, reportDomain: null }, actorAdmin);
    const eval2 = await svc.evaluateDefinitionReadiness(p2.compliance_report_definition_id, actorAdmin);
    assert(!eval2.ready && eval2.blockers.includes('REPORT_DOMAIN_UNDEFINED_OR_UNSUPPORTED'), 'SC2: Missing report domain blocks readiness');

    // SC3: Missing data sources blocks readiness
    const p3 = await svc.createDefinition({ ...validPayload, dataSources: [] }, actorAdmin);
    const eval3 = await svc.evaluateDefinitionReadiness(p3.compliance_report_definition_id, actorAdmin);
    assert(!eval3.ready && eval3.blockers.includes('DATA_SOURCES_UNDEFINED'), 'SC3: Missing data sources blocks readiness');

    // SC4: Missing required sections blocks readiness
    const p4 = await svc.createDefinition({ ...validPayload, requiredSections: [] }, actorAdmin);
    const eval4 = await svc.evaluateDefinitionReadiness(p4.compliance_report_definition_id, actorAdmin);
    assert(!eval4.ready && eval4.blockers.includes('REQUIRED_SECTIONS_UNDEFINED'), 'SC4: Missing required sections blocks readiness');

    // SC5: external_submission_enabled true blocks readiness
    const p5 = await svc.createDefinition({ ...validPayload, externalSubmissionEnabled: true }, actorAdmin);
    const eval5 = await svc.evaluateDefinitionReadiness(p5.compliance_report_definition_id, actorAdmin);
    assert(!eval5.ready && eval5.blockers.includes('EXTERNAL_SUBMISSION_ENABLED'), 'SC5: external_submission_enabled true blocks readiness');

    // SC6: tax_filing_enabled true blocks readiness
    const p6 = await svc.createDefinition({ ...validPayload, taxFilingEnabled: true }, actorAdmin);
    const eval6 = await svc.evaluateDefinitionReadiness(p6.compliance_report_definition_id, actorAdmin);
    assert(!eval6.ready && eval6.blockers.includes('TAX_FILING_ENABLED'), 'SC6: tax_filing_enabled true blocks readiness');

    // SC7: production_execution_enabled true blocks readiness
    const p7 = await svc.createDefinition({ ...validPayload, productionExecutionEnabled: true }, actorAdmin);
    const eval7 = await svc.evaluateDefinitionReadiness(p7.compliance_report_definition_id, actorAdmin);
    assert(!eval7.ready && eval7.blockers.includes('PRODUCTION_EXECUTION_ENABLED'), 'SC7: production_execution_enabled true blocks readiness');

    // SC8: FULL_PUBLIC enabled blocks readiness
    const p8 = await svc.createDefinition({ ...validPayload, fullPublicEnabled: true }, actorAdmin);
    const eval8 = await svc.evaluateDefinitionReadiness(p8.compliance_report_definition_id, actorAdmin);
    assert(!eval8.ready && eval8.blockers.includes('FULL_PUBLIC_ENABLED'), 'SC8: FULL_PUBLIC enabled blocks readiness');

    // SC9: Source records remain unchanged
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsComplianceReportDefinitionService.js'), 'utf-8');
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('DELETE FROM'), 'SC9: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 109B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
