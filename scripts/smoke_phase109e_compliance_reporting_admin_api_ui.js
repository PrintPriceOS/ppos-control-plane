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
    console.log('\n━━━ Phase 109E — Admin Financial Compliance Reporting API + UI Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsComplianceReporting.js');
    assert(fs.existsSync(adminRoute), 'SC1: Route file exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-compliance-reporting');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsComplianceReportingPage.tsx')), 'SC2: UI files exist');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsComplianceReportingPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Financial compliance reporting readiness only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not submit reports externally'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not file taxes'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not submit VAT returns'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not submit invoices externally'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Compliance reports are preview-only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Export previews are manual-only and redacted'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Source records are not mutated'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Prepared for compliance reporting readiness review only'), 'SC3: Required caution copy exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/definitions'), 'SC4: Definitions endpoint exists');
    assert(routeContent.includes('/definitions/:complianceReportDefinitionId/approve'), 'SC4: Definition approve endpoint exists');
    assert(routeContent.includes('/runs/:complianceReportRunId/build-preview'), 'SC4: Runs build-preview endpoint exists');
    assert(routeContent.includes('/runs/:complianceReportRunId/review'), 'SC4: Runs review endpoint exists');
    
    assert(routeContent.includes('/sections'), 'SC5: Sections endpoint exists');
    assert(routeContent.includes('/findings'), 'SC5: Findings endpoint exists');
    assert(routeContent.includes('/audit'), 'SC5: Audit endpoint exists');
    assert(routeContent.includes('/export-preview'), 'SC5: Export-preview endpoint exists');

    assert(!routeContent.includes('submitReport') && !routeContent.includes('fileTax') && !routeContent.includes('executePayment'), 'SC6: No live external submission/tax filing/source mutation exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 109E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
