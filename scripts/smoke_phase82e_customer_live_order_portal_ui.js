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
    console.log('\n━━━ Phase 82E — Customer Live Order Portal UI Smoke ━━━\n');

    const uiDir = path.join(ROOT, 'src', 'ui', 'pages', 'customer-live-orders');
    
    // SC1-SC10
    const files = [
        'CustomerLiveOrdersPage.tsx',
        'CustomerLiveOrderDetailPage.tsx',
        'CustomerLiveOrderStatusCard.tsx',
        'CustomerNextActionsPanel.tsx',
        'CustomerProofApprovalPanel.tsx',
        'CustomerFileUploadPanel.tsx',
        'CustomerPaymentReferencePanel.tsx',
        'CustomerMessagesPanel.tsx',
        'CustomerSafeTimelinePanel.tsx',
        'CustomerOrderDocumentsPanel.tsx'
    ];

    files.forEach((f, i) => {
        assert(fs.existsSync(path.join(uiDir, f)), `SC${i+1}: ${f.replace('.tsx', '')} exists`);
    });

    const detailContent = fs.readFileSync(path.join(uiDir, 'CustomerLiveOrderDetailPage.tsx'), 'utf8');

    // SC11
    assert(detailContent.includes('Order status is shown for your convenience') && detailContent.includes('Production can continue only after all required checks and approvals are complete'), 'SC11: Customer-safe banner present');

    // Gather all content
    let allContent = '';
    files.forEach(f => {
        allContent += fs.readFileSync(path.join(uiDir, f), 'utf8') + '\n';
    });
    const contentLower = allContent.toLowerCase();

    // SC12-15
    assert(!contentLower.includes('governance_snapshot_json'), 'SC12: No raw governance JSON wording');
    assert(!contentLower.includes('machineid') && !contentLower.includes('machine_id'), 'SC13: No machine internals');
    assert(!contentLower.includes('guaranteed delivery'), 'SC14: No guaranteed delivery wording');
    assert(!contentLower.includes('certified') && !contentLower.includes('print-ready'), 'SC15: No false certified/print-ready wording');

    // SC16
    assert(fs.existsSync(path.join(ROOT, 'src', 'ui', 'api', 'customerLiveOrdersClient.ts')), 'SC16: Customer API client exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 82E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
