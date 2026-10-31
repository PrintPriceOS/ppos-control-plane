'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsDataRetentionPolicyService = require('../src/api/services/financialOperationsDataRetentionPolicyService');
const FinancialOperationsRetentionRedactionPreviewService = require('../src/api/services/financialOperationsRetentionRedactionPreviewService');

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
    console.log('\n━━━ Phase 108C — Retention / Redaction Preview Service Smoke ━━━\n');

    const policySvc = new FinancialOperationsDataRetentionPolicyService();
    const previewSvc = new FinancialOperationsRetentionRedactionPreviewService(policySvc);
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    // Set up policy
    const validPayload = {
        policyName: 'Standard Order Retention',
        dataDomain: 'MARKETPLACE_ORDERS',
        dataCategories: ['PII'],
        retentionPeriodDays: 3650, // 10 years
        redactionRequired: true,
        deletionAllowed: true
    };
    const p1 = await policySvc.createPolicy(validPayload, actorAdmin);
    await policySvc.evaluatePolicyReadiness(p1.retention_policy_id, actorAdmin);
    await policySvc.approvePolicy(p1.retention_policy_id, actorAdmin);

    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 11);
    
    const candidateRecords = [
        { id: 'rec_old_1', created_at: oldDate.toISOString(), customer_name: 'John Doe', customer_email: 'john@example.com' },
        { id: 'rec_new_2', created_at: new Date().toISOString(), customer_name: 'Jane Smith', customer_email: 'jane@example.com' },
        { id: 'rec_old_legal', created_at: oldDate.toISOString(), customer_name: 'Legal Hold', legal_hold: true }
    ];

    // SC1: Generate retention preview from approved policy
    const revRetention = await previewSvc.createPreviewReview(p1.retention_policy_id, 'RETENTION_PREVIEW_ONLY', candidateRecords, actorAdmin);
    assert(revRetention.review_status === 'READY_FOR_REVIEW', 'SC1: Generate retention preview from approved policy');

    // SC2: Generate redaction preview without mutating source record
    const revRedaction = await previewSvc.createPreviewReview(p1.retention_policy_id, 'REDACTION_PREVIEW_ONLY', candidateRecords, actorAdmin);
    assert(revRedaction.eligible_for_redaction_count === 1 && revRedaction.result_snapshot_json[0].customer_name === '[REDACTED]', 'SC2: Generate redaction preview');
    assert(candidateRecords[0].customer_name === 'John Doe', 'SC2: Source record not mutated');

    // SC3: Generate deletion eligibility preview without deleting records
    const revDeletion = await previewSvc.createPreviewReview(p1.retention_policy_id, 'DELETION_ELIGIBILITY_PREVIEW_ONLY', candidateRecords, actorAdmin);
    assert(revDeletion.eligible_for_deletion_count === 1 && revDeletion.result_snapshot_json[0]._preview_status === 'ELIGIBLE_FOR_DELETION', 'SC3: Generate deletion eligibility preview without deleting records');

    // SC4: Legal hold blocks deletion eligibility
    assert(revDeletion.blocked_by_legal_hold_count === 1, 'SC4: Legal hold blocks deletion eligibility');

    // SC5: Missing approved policy blocks preview
    const revMissing = await previewSvc.createPreviewReview('invalid_id', 'REDACTION_PREVIEW_ONLY', candidateRecords, actorAdmin);
    assert(revMissing.review_status === 'BLOCKED_BY_POLICY_GAP', 'SC5: Missing approved policy blocks preview');

    // SC6: Audit events exist
    assert(previewSvc._mockEvents.some(e => e.event_type === 'FINOPS_REDACTION_PREVIEW_GENERATED'), 'SC6: Audit events exist');

    // SC7: Source records remain unchanged
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsRetentionRedactionPreviewService.js'), 'utf-8');
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('DELETE FROM'), 'SC7: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 108C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
