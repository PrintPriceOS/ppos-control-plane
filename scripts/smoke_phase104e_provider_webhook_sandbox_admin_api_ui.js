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
    console.log('\n━━━ Phase 104E — Admin Provider Webhook Sandbox API + UI Stubs Smoke ━━━\n');

    const adminRoute = path.join(ROOT, 'src/api/routes/adminFinancialOperationsProviderWebhookSandbox.js');
    assert(fs.existsSync(adminRoute), 'SC1: Route file exists');

    const uiAdmin = path.join(ROOT, 'src/ui/pages/financial-operations-provider-webhook-sandbox');

    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderWebhookSandboxPage.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderWebhookEventTestTable.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderWebhookMockEventPanel.tsx')), 'SC2: UI files exist');
    assert(fs.existsSync(path.join(uiAdmin, 'FinancialOperationsProviderWebhookReplayPanel.tsx')), 'SC2: UI files exist');

    const adminPageContent = fs.readFileSync(path.join(uiAdmin, 'FinancialOperationsProviderWebhookSandboxPage.tsx'), 'utf-8');

    assert(adminPageContent.includes('Provider webhook sandbox readiness only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not expose live webhook endpoints'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Live provider traffic is not accepted'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Live signing secrets are not used'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Mock/stub webhook only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Dry-run events only'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Replay readiness does not process live events'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payment'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute refund'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('This does not execute payout'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No external invoice submission is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('No tax filing is enabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('FULL_PUBLIC remains disabled'), 'SC3: Required caution copy exists');
    assert(adminPageContent.includes('Prepared for webhook sandbox readiness review only'), 'SC3: Required caution copy exists');

    const routeContent = fs.readFileSync(adminRoute, 'utf-8');
    assert(routeContent.includes('/webhooks/:webhookSandboxId/approve'), 'SC4: Webhook sandbox actions exist');
    assert(routeContent.includes('/tests/:webhookEventTestId/mock'), 'SC5: Mock event test actions exist');
    assert(routeContent.includes('/tests/:webhookEventTestId/stub'), 'SC5: Stub event test actions exist');
    assert(routeContent.includes('/tests/:webhookEventTestId/dry-run'), 'SC5: Dry-run event test actions exist');
    assert(routeContent.includes('/webhooks/:webhookSandboxId/replay'), 'SC6: Replay readiness endpoint exists');
    assert(routeContent.includes('/audit'), 'SC7: Audit endpoint exists');

    assert(!routeContent.includes('executePayment') && !routeContent.includes('executeRefund'), 'SC8: No real execution exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 104E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
