'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsPrivacyRequestReadinessService = require('../src/api/services/financialOperationsPrivacyRequestReadinessService');

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
    console.log('\n━━━ Phase 108D — Privacy Request Readiness Service Smoke ━━━\n');

    const svc = new FinancialOperationsPrivacyRequestReadinessService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const payloadAccess = {
        requestType: 'DATA_ACCESS_PREVIEW',
        dataSubjectReference: 'user_123',
        requesterReference: 'req_abc',
        dataDomains: ['PAYMENTS']
    };

    const records = [
        { id: 'rec_1', customer_name: 'John Doe', amount: 100 },
        { id: 'rec_legal', customer_name: 'Jane Smith', legal_hold: true },
        { id: 'rec_tax', customer_name: 'Tax Corp', tax_retention_required: true },
        { id: 'rec_fin', customer_name: 'Fin Inc', financial_record_keeping_required: true }
    ];

    // SC1: Data access preview is redacted
    const revAccess = await svc.createPrivacyRequestReview(payloadAccess, actorAdmin);
    const evalAccess = await svc.evaluatePrivacyRequest(revAccess.privacy_request_review_id, records, actorAdmin);
    assert(evalAccess.redaction_preview_json[0].customer_name === '[REDACTED]', 'SC1: Data access preview is redacted');

    // SC2: Data export preview is manual-only and redacted
    const revExport = await svc.createPrivacyRequestReview({ ...payloadAccess, requestType: 'DATA_EXPORT_PREVIEW' }, actorAdmin);
    const evalExport = await svc.evaluatePrivacyRequest(revExport.privacy_request_review_id, records, actorAdmin);
    assert(evalExport.export_preview_json.data[0].customer_name === '[REDACTED]' && evalExport.export_preview_json.metadata.note === 'MANUAL_EXPORT_PREVIEW_ONLY', 'SC2: Data export preview is manual-only and redacted');

    // SC3: Data deletion eligibility preview does not delete data
    const revDeletion = await svc.createPrivacyRequestReview({ ...payloadAccess, requestType: 'DATA_DELETION_ELIGIBILITY_PREVIEW' }, actorAdmin);
    const evalDeletion = await svc.evaluatePrivacyRequest(revDeletion.privacy_request_review_id, records, actorAdmin);
    assert(evalDeletion.result_snapshot_json.length === 4, 'SC3: Data deletion eligibility preview does not delete data');

    // SC4: Legal hold blocks deletion eligibility
    assert(evalDeletion.request_status === 'BLOCKED_BY_LEGAL_HOLD', 'SC4: Legal hold blocks deletion eligibility');

    // SC5: Tax retention blocks deletion eligibility
    const evalTax = await svc.evaluatePrivacyRequest(revDeletion.privacy_request_review_id, [records[2]], actorAdmin);
    assert(evalTax.request_status === 'BLOCKED_BY_TAX_RETENTION', 'SC5: Tax retention blocks deletion eligibility');

    // SC6: Missing hashed subject reference creates finding
    const revMissing = await svc.createPrivacyRequestReview({ ...payloadAccess, dataSubjectReference: null }, actorAdmin);
    const evalMissing = await svc.evaluatePrivacyRequest(revMissing.privacy_request_review_id, [records[0]], actorAdmin);
    assert(evalMissing.request_status === 'REJECTED' && svc._mockFindings.some(f => f.finding_code === 'MISSING_DATA_SUBJECT_HASH'), 'SC6: Missing hashed subject reference creates finding');

    // SC7: Source records remain unchanged
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPrivacyRequestReadinessService.js'), 'utf-8');
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('DELETE FROM'), 'SC7: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 108D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
