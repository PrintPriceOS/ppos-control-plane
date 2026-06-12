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
    console.log('\n━━━ Phase 112E — Admin Final Release Candidate API + UI Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsFinalReleaseCandidate.js');
    assert(fs.existsSync(adminRoute), 'SC1: Route file exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-final-release-candidate');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsFinalReleaseCandidatePage.tsx')), 'SC2: UI files exist');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsFinalReleaseCandidatePage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Financial operations final release candidate only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not activate production'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Release candidate approval does not activate production'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Live providers are not connected'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payment'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute refund'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payout'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not submit invoices externally'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not file taxes'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not submit VAT returns'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not submit reports externally'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Source records are not mutated'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Prepared for final release candidate review only'), 'SC3: Required caution copy exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/candidates'), 'SC4: Candidates endpoint exists');
    assert(routeContent.includes('/evaluate'), 'SC4: Evaluate endpoint exists');
    assert(routeContent.includes('/build-evidence-pack'), 'SC4: Build-evidence-pack endpoint exists');
    assert(routeContent.includes('/review'), 'SC4: Review endpoint exists');
    
    assert(routeContent.includes('/checks'), 'SC5: Checks endpoint exists');
    assert(routeContent.includes('/evidence'), 'SC5: Evidence endpoint exists');
    assert(routeContent.includes('/findings'), 'SC5: Findings endpoint exists');
    assert(routeContent.includes('/audit'), 'SC5: Audit endpoint exists');
    assert(routeContent.includes('/export-preview'), 'SC5: Export-preview endpoint exists');

    assert(!routeContent.includes('activateProduction') && !routeContent.includes('fileTax') && !routeContent.includes('executePayment'), 'SC6: No live external submission/production activation/source mutation exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 112E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
