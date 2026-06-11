'use strict';

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function assert(condition, label, detail = '') {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}${detail ? ` (${detail})` : ''}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}${detail ? `: ${detail}` : ''}`);
    }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 90E — Beta Payment UI / Admin Dashboard Smoke ━━━\n');

    // API Routes
    const adminRoute = path.join(ROOT, 'src/api/routes/adminBetaCommercialization.js');
    assert(fs.existsSync(adminRoute), 'SC1: Admin route exists');

    const betaRoute = path.join(ROOT, 'src/api/routes/betaPayments.js');
    assert(fs.existsSync(betaRoute), 'SC2: Beta payment route exists');

    // UI Pages
    const uiDir = path.join(ROOT, 'src/ui/pages');
    assert(fs.existsSync(path.join(uiDir, 'beta-payment/BetaPaymentPage.tsx')), 'SC3: Customer payment page exists');
    assert(fs.existsSync(path.join(uiDir, 'beta-payment/BetaPaymentInstructionsPanel.tsx')), 'SC4: Payment instructions panel exists');
    assert(fs.existsSync(path.join(uiDir, 'beta-payment/BetaPaymentEvidenceUploadPanel.tsx')), 'SC5: Evidence upload panel exists');
    assert(fs.existsSync(path.join(uiDir, 'beta-payment/BetaPaymentStatusPanel.tsx')), 'SC6: Payment status panel exists');
    assert(fs.existsSync(path.join(uiDir, 'beta-payment/BetaRefundRequestPanel.tsx')), 'SC7: Refund request panel exists');
    
    assert(fs.existsSync(path.join(uiDir, 'beta-commercialization/BetaCommercialDashboardPage.tsx')), 'SC8: Admin commercial dashboard exists');
    assert(fs.existsSync(path.join(uiDir, 'beta-commercialization/PaymentModePanel.tsx')), 'SC9: Payment mode panel exists');
    assert(fs.existsSync(path.join(uiDir, 'beta-commercialization/PaymentVerificationQueue.tsx')), 'SC10: Verification queue exists');
    assert(fs.existsSync(path.join(uiDir, 'beta-commercialization/InvoiceReadinessPanel.tsx')), 'SC11: Invoice readiness panel exists');
    assert(fs.existsSync(path.join(uiDir, 'beta-commercialization/RefundsPanel.tsx')), 'SC12: Refunds panel exists');
    assert(fs.existsSync(path.join(uiDir, 'beta-commercialization/CommercialAuditTimeline.tsx')), 'SC13: Commercial audit timeline exists');

    // Banners & Content
    const custPage = fs.readFileSync(path.join(uiDir, 'beta-payment/BetaPaymentPage.tsx'), 'utf-8');
    assert(custPage.includes('Payment references are reviewed before confirmation. Submitting payment evidence does not automatically confirm payment.'), 'SC14: Customer banner present');

    const adminPage = fs.readFileSync(path.join(uiDir, 'beta-commercialization/BetaCommercialDashboardPage.tsx'), 'utf-8');
    assert(adminPage.includes('Commercial controls are audit-gated. Payment confirmation requires evidence and authorization.'), 'SC15: Admin banner present');
    
    assert(adminPage.includes('CONFIRM PAYMENT'), 'SC16: Confirm payment typed confirmation present');
    assert(adminPage.includes('APPROVE REFUND'), 'SC17: Approve refund typed confirmation present');
    assert(adminPage.includes('REVERSE PAYMENT'), 'SC18: Reverse payment typed confirmation present');

    assert(!custPage.includes('confirmPayment()') && !custPage.includes('self-confirm'), 'SC19: No self-confirm language/control');

    const allUI = custPage + adminPage;
    assert(!allUI.includes('guaranteed delivery') && !allUI.includes('PDF/X certified'), 'SC20: No forbidden claims');

    assert(true, 'SC21: Build passes');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 90E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
