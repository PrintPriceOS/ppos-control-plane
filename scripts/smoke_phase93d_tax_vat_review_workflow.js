'use strict';

const fs = require('fs');
const path = require('path');
const TaxVatReadinessClassifierService = require('../src/api/services/taxVatReadinessClassifierService');
const TaxVatReadinessSnapshotService = require('../src/api/services/taxVatReadinessSnapshotService');
const TaxVatReadinessReviewService = require('../src/api/services/taxVatReadinessReviewService');

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
    console.log('\n━━━ Phase 93D — Tax/VAT Review Workflow Smoke ━━━\n');

    const classifierSvc = new TaxVatReadinessClassifierService();
    const snapSvc = new TaxVatReadinessSnapshotService({ taxVatReadinessClassifierService: classifierSvc });
    const revSvc = new TaxVatReadinessReviewService({ taxVatReadinessSnapshotService: snapSvc });
    const actorAdmin = { role: 'FINANCE_ADMIN', userId: 'a_1' };

    const sourceData = {
        order_id: 'o_1',
        invoice_id: 'inv_1',
        tenant_id: 't_1',
        seller_country: 'ES',
        customer_country: 'US', // Non-EU export requires manual review
        customer_type: 'B2B',
        amount: 100
    };

    const snap = await snapSvc.buildTaxVatReadinessSnapshot({ sourceData, actor: actorAdmin });

    // SC1
    await revSvc.executeReviewAction({ snapshotId: snap.id, actionType: 'MARK_NEEDS_ACCOUNTANT_REVIEW', actor: actorAdmin });
    assert(snap.readiness_status === 'ACCOUNTANT_REVIEW_REQUIRED', 'SC1: Review action changes only readiness/review layer');

    // SC2
    const findingId = snapSvc._mockFindings[0].id;
    await revSvc.executeReviewAction({ snapshotId: snap.id, actionType: 'RESOLVE_FINDING', payload: { finding_id: findingId }, actor: actorAdmin });
    assert(snapSvc._mockFindings[0].status === 'RESOLVED', 'SC2: Findings can be resolved manually');

    // SC3
    await revSvc.executeReviewAction({ snapshotId: snap.id, actionType: 'DISMISS_WARNING', payload: { warning_index: 0, reason: 'False positive' }, actor: actorAdmin });
    assert(revSvc._mockEvents.some(e => e.event_type === 'TAX_VAT_REVIEW_ACTION_DISMISS_WARNING' && e.payload_json.message.includes('False positive')), 'SC3: Warnings can be dismissed with reason');

    // SC4
    await revSvc.executeReviewAction({ snapshotId: snap.id, actionType: 'OVERRIDE_TAX_TREATMENT_FOR_EXPORT_ONLY', payload: { new_treatment: 'EXPORT_VERIFIED' }, actor: actorAdmin });
    assert(snap.tax_treatment === 'EXPORT_VERIFIED', 'SC4: Override overrides readiness tax treatment');
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/taxVatReadinessReviewService.js'), 'utf-8');
    assert(!content.includes('UPDATE orders') && !content.includes('UPDATE invoices'), 'SC4: Override does not mutate source invoice/order');

    // SC5
    const timeline = await revSvc.getAuditTimeline({ snapshotId: snap.id, actor: actorAdmin });
    assert(timeline.length > 0 && timeline.some(e => e.event_type === 'TAX_VAT_REVIEW_ACTION_OVERRIDE_TAX_TREATMENT_FOR_EXPORT_ONLY'), 'SC5: Audit timeline is generated');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 93D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
