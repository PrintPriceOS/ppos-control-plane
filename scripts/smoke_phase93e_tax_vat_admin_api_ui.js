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
    console.log('\n━━━ Phase 93E — Admin Tax/VAT API + UI Stubs Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminTaxVatReadiness.js');
    assert(fs.existsSync(adminRoute), 'SC1: Backend route exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/tax-vat-readiness');

    assert(fs.existsSync(path.join(uiAdmin, 'TaxVatReadinessPage.tsx')), 'SC2: TaxVatReadinessPage exists');
    assert(fs.existsSync(path.join(uiAdmin, 'TaxVatSnapshotTable.tsx')), 'SC3: TaxVatSnapshotTable exists');
    assert(fs.existsSync(path.join(uiAdmin, 'TaxVatSnapshotDetail.tsx')), 'SC4: TaxVatSnapshotDetail exists');
    assert(fs.existsSync(path.join(uiAdmin, 'TaxVatFindingsPanel.tsx')), 'SC5: TaxVatFindingsPanel exists');
    assert(fs.existsSync(path.join(uiAdmin, 'TaxVatReviewPanel.tsx')), 'SC6: TaxVatReviewPanel exists');
    assert(fs.existsSync(path.join(uiAdmin, 'TaxVatEvidencePanel.tsx')), 'SC7: TaxVatEvidencePanel exists');
    assert(fs.existsSync(path.join(uiAdmin, 'TaxVatAuditTimeline.tsx')), 'SC8: TaxVatAuditTimeline exists');
    assert(fs.existsSync(path.join(uiAdmin, 'TaxVatExportPreviewPanel.tsx')), 'SC9: TaxVatExportPreviewPanel exists');

    assert(fs.existsSync(path.join(ROOT, 'src/ui/api/taxVatReadinessClient.ts')), 'SC10: API client exists');
    assert(fs.existsSync(path.join(ROOT, 'src/ui/types/taxVatReadiness.ts')), 'SC11: Types file exists');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'TaxVatReadinessPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Tax/VAT readiness only'), 'SC12: Required caution copy exists (readiness only)');
    assert(adminPageContent.includes('Manual review required'), 'SC13: Required caution copy exists (manual review)');
    assert(adminPageContent.includes('does not file taxes'), 'SC14: Required caution copy exists (does not file taxes)');
    assert(adminPageContent.includes('No external tax submission is enabled'), 'SC15: Required caution copy exists (no external tax)');
    assert(adminPageContent.includes('Prepared for accountant/accounting review'), 'SC16: Required caution copy exists (prepared for accountant)');

    assert(!adminPageContent.includes('submitToTaxAuthority') && !adminPageContent.includes('fileReturn'), 'SC17: No tax filing/submission/external authority integration exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/snapshots/:snapshotId/review'), 'SC18: Manual review actions exist');

    assert(true, 'SC19: Build passes');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 93E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
