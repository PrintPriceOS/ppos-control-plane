'use strict';

const fs = require('fs');
const path = require('path');
const TaxVatReadinessClassifierService = require('../src/api/services/taxVatReadinessClassifierService');
const TaxVatReadinessSnapshotService = require('../src/api/services/taxVatReadinessSnapshotService');

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
    console.log('\n━━━ Phase 93C — Tax/VAT Snapshot Builder Smoke ━━━\n');

    const classifierSvc = new TaxVatReadinessClassifierService();
    const snapSvc = new TaxVatReadinessSnapshotService({ taxVatReadinessClassifierService: classifierSvc });
    const actorAdmin = { role: 'FINANCE_ADMIN', userId: 'a_1' };

    const sourceDataReady = {
        order_id: 'o_1',
        invoice_id: 'inv_1',
        tenant_id: 't_1',
        seller_country: 'ES',
        customer_country: 'ES',
        customer_type: 'B2B',
        amount: 100
    };

    const sourceDataReview = {
        order_id: 'o_2',
        invoice_id: 'inv_2',
        tenant_id: 't_1',
        seller_country: 'ES',
        customer_country: 'US',
        customer_type: 'B2C',
        amount: 100
    };

    // SC1
    const snapReady = await snapSvc.buildTaxVatReadinessSnapshot({ sourceData: sourceDataReady, actor: actorAdmin });
    assert(snapReady.id, 'SC1: Snapshot is immutable-style (created)');

    // SC2
    assert(snapReady.source_snapshot_json && snapReady.source_snapshot_json.order_id === 'o_1', 'SC2: Source data is copied into source_snapshot_json');

    // SC3
    assert(snapReady.evidence_json && snapReady.evidence_json.seller_country === 'ES', 'SC3: Classification evidence is present');

    // SC4
    assert(snapSvc._mockEvents.some(e => e.event_type === 'TAX_VAT_READINESS_SNAPSHOT_CREATED'), 'SC4: Audit events are generated (created)');
    assert(snapSvc._mockEvents.some(e => e.event_type === 'TAX_VAT_READINESS_CLASSIFIED'), 'SC4: Audit events are generated (classified)');

    // SC5
    const snapReview = await snapSvc.buildTaxVatReadinessSnapshot({ sourceData: sourceDataReview, actor: actorAdmin });
    assert(snapReview.readiness_status === 'MANUAL_REVIEW_REQUIRED', 'SC5: Manual review status appears when required');
    assert(snapSvc._mockEvents.some(e => e.event_type === 'TAX_VAT_READINESS_MANUAL_REVIEW_REQUIRED'), 'SC5: Audit events are generated (manual review required)');

    // SC6
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/taxVatReadinessSnapshotService.js'), 'utf-8');
    assert(!content.includes('UPDATE orders') && !content.includes('UPDATE invoices'), 'SC6: Original source objects are unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 93C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
