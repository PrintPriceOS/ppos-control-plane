'use strict';

const fs = require('fs');
const path = require('path');
const TaxVatReadinessClassifierService = require('../src/api/services/taxVatReadinessClassifierService');

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
    console.log('\n━━━ Phase 93B — Tax/VAT Classifier Smoke ━━━\n');

    const svc = new TaxVatReadinessClassifierService();

    // SC1: Domestic
    const r1 = svc.classifyReadiness({ seller_country: 'ES', customer_country: 'ES', customer_type: 'B2B', amount: 100 });
    assert(r1.tax_treatment === 'DOMESTIC_VAT' && r1.readiness_status === 'READY', 'SC1: Domestic seller/customer same EU country');

    // SC2: Intra-EU B2B with VAT ID
    const r2 = svc.classifyReadiness({ seller_country: 'ES', customer_country: 'FR', customer_type: 'B2B', customer_vat_id: 'FR123', amount: 100 });
    assert(r2.tax_treatment === 'INTRA_EU_B2B_REVERSE_CHARGE' && r2.reverse_charge_flag === true && r2.readiness_status === 'READY', 'SC2: EU B2B with VAT ID and reverse-charge candidate');

    // SC3: Intra-EU B2B missing VAT ID
    const r3 = svc.classifyReadiness({ seller_country: 'ES', customer_country: 'FR', customer_type: 'B2B', customer_vat_id: null, amount: 100 });
    assert(r3.readiness_status === 'MANUAL_REVIEW_REQUIRED' && r3.findings.includes('MISSING_CUSTOMER_VAT_ID'), 'SC3: EU B2B missing VAT ID');

    // SC4: Intra-EU B2C
    const r4 = svc.classifyReadiness({ seller_country: 'ES', customer_country: 'FR', customer_type: 'B2C', amount: 100 });
    assert(r4.readiness_status === 'MANUAL_REVIEW_REQUIRED' && r4.tax_treatment === 'INTRA_EU_B2C_OSS_CANDIDATE', 'SC4: EU B2C cross-border');

    // SC5: Non-EU export
    const r5 = svc.classifyReadiness({ seller_country: 'ES', customer_country: 'US', customer_type: 'B2B', amount: 100 });
    assert(r5.readiness_status === 'MANUAL_REVIEW_REQUIRED' && r5.tax_treatment === 'EXPORT_NON_EU', 'SC5: Non-EU customer/export review');

    // SC6: Missing jurisdiction
    const r6 = svc.classifyReadiness({ seller_country: 'ES', customer_country: null, amount: 100 });
    assert(r6.readiness_status === 'MANUAL_REVIEW_REQUIRED' && r6.findings.includes('MISSING_JURISDICTION_DATA'), 'SC6: Missing jurisdiction');

    // SC7: Mismatched invoice tax amount
    const r7 = svc.classifyReadiness({ seller_country: 'ES', customer_country: 'ES', customer_type: 'B2B', amount: 100, expected_tax_amount: 15 });
    assert(r7.readiness_status === 'MANUAL_REVIEW_REQUIRED' && r7.findings.includes('TAX_AMOUNT_MISMATCH'), 'SC7: Mismatched invoice tax amount vs expected estimate');

    // General validation
    assert(r1.readiness_note && r1.readiness_note.includes('not represent a legal tax filing'), 'SC8: Clearly marks outputs as readiness only');

    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/taxVatReadinessClassifierService.js'), 'utf-8');
    assert(!content.includes('UPDATE orders') && !content.includes('db.query'), 'SC9: Service does not mutate source records');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 93B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
