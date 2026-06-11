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
    console.log('\n━━━ Phase 83E — Partner Job Board UI Smoke ━━━\n');

    const files = [
        'src/ui/partner-job-board/PartnerJobBoardPage.tsx',
        'src/ui/partner-job-board/components/PartnerJobList.tsx',
        'src/ui/partner-job-board/components/PartnerJobDetail.tsx',
        'src/ui/partner-job-board/components/PartnerProductionControls.tsx',
        'src/ui/partner-job-board/components/PartnerIncidentReporter.tsx'
    ];

    // SC1
    let allExist = true;
    for (const f of files) {
        if (!fs.existsSync(path.join(ROOT, f))) {
            allExist = false;
        }
    }
    assert(allExist, 'SC1: All UI component files exist');

    let combinedContent = '';
    for (const f of files) {
        combinedContent += fs.readFileSync(path.join(ROOT, f), 'utf-8');
    }

    // SC2
    assert(combinedContent.includes('PartnerJobBoardPage') && combinedContent.includes('export const'), 'SC2: Components export correctly');

    // SC3
    assert(!combinedContent.includes('operator_snapshot_json') && !combinedContent.includes('raw_billing_data'), 'SC3: UI does not render raw internal payloads');

    // SC4
    assert(!combinedContent.includes('approve-proof') && !combinedContent.includes('Approve Payment'), 'SC4: UI does not contain governance mutation controls');

    // SC5
    assert(!combinedContent.includes('Enable Live Production'), 'SC5: UI does not contain live enablement controls');

    // SC6
    assert(!combinedContent.includes('guaranteed delivery') && !combinedContent.includes('PDF/X certified') && !combinedContent.includes('print-ready'), 'SC6: UI does not contain overclaims');

    // SC7
    assert(combinedContent.includes('Requires Evidence'), 'SC7: Completion explicitly requires evidence in UI');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 83E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
