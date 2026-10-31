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

async function runSmoke() {
    console.log('\n━━━ Phase 108E — Admin Financial Data Retention / Privacy API + UI Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsDataRetentionPrivacy.js');
    assert(fs.existsSync(adminRoute), 'SC1: Route file exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-data-retention-privacy');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsDataRetentionPrivacyPage.tsx')), 'SC2: UI files exist');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsDataRetentionPrivacyPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Financial data retention/privacy readiness only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not delete live records'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not anonymize live records'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not redact source records in place'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Privacy exports are preview-only and redacted'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Deletion eligibility is preview-only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Source records are not mutated'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No external invoice submission is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No tax filing is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Prepared for data retention/privacy readiness review only'), 'SC3: Required caution copy exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/policies'), 'SC4: Policies endpoint exists');
    assert(routeContent.includes('/policies/:retentionPolicyId/approve'), 'SC4: Policy approve endpoint exists');
    assert(routeContent.includes('/reviews/:retentionReviewId/simulate'), 'SC4: Reviews simulate endpoint exists');
    assert(routeContent.includes('/privacy-requests/:privacyRequestReviewId/evaluate'), 'SC4: Privacy request evaluate endpoint exists');
    
    assert(routeContent.includes('/findings'), 'SC5: Findings endpoint exists');
    assert(routeContent.includes('/audit'), 'SC5: Audit endpoint exists');
    assert(routeContent.includes('/export-preview'), 'SC5: Export-preview endpoint exists');

    assert(!routeContent.includes('deleteRecord') && !routeContent.includes('executePayment'), 'SC6: No live deletion/anonymization/source redaction/export/full public/source mutation exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 108E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
