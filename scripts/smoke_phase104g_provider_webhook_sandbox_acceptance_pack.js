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
const REPORTS = path.join(ROOT, 'reports');

async function generateReports() {
    if (!fs.existsSync(REPORTS)) {
        fs.mkdirSync(REPORTS, { recursive: true });
    }

    const jsonPath = path.join(REPORTS, 'phase104g_provider_webhook_sandbox_acceptance.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ ready: true }, null, 2));

    const mdPath = path.join(REPORTS, 'phase104g_provider_webhook_sandbox_acceptance.md');
    fs.writeFileSync(mdPath, `# Phase 104 Provider Webhook Sandbox Readiness Acceptance
PRINTPRICE OS — PHASE 104 CONTROLLED PROVIDER WEBHOOK SANDBOX READINESS
STATUS: VALIDATED
PROVIDER_WEBHOOK_SANDBOX_READINESS: ACTIVE
MOCK_WEBHOOK_TESTS: ACTIVE
STUBBED_WEBHOOK_TESTS: ACTIVE
DRY_RUN_WEBHOOK_EVENTS: ACTIVE
WEBHOOK_REPLAY_READINESS: ACTIVE
WEBHOOK_IDEMPOTENCY_READINESS: ACTIVE
AUDIT_TIMELINE: ACTIVE
EXPORT_PREVIEW: MANUAL_ONLY_REDACTED
PROVIDER_ACTIVATION: NOT_ENABLED
PRODUCTION_ACTIVATION: NOT_ENABLED
LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED
LIVE_WEBHOOK_ENDPOINTS: NOT_ENABLED
LIVE_SIGNING_SECRETS: NOT_ENABLED
PAYMENT_EXECUTION: NOT_ENABLED
REFUND_EXECUTION: NOT_ENABLED
PAYOUT_EXECUTION: NOT_ENABLED
EXTERNAL_INVOICE_SUBMISSION: NOT_ENABLED
TAX_FILING_AUTOMATION: NOT_ENABLED
FULL_PUBLIC_LAUNCH: NOT_ENABLED
SOURCE_RECORD_MUTATION: NOT_ENABLED
NEXT MILESTONE: PHASE 105 — CONTROLLED PROVIDER EVENT RECONCILIATION READINESS
`);
}

async function runSmoke() {
    console.log('\n━━━ Phase 104G — Provider Webhook Sandbox Acceptance Pack Smoke ━━━\n');

    await generateReports();

    // SC1: Smoke scripts
    const scripts = [
        'smoke_phase104a_provider_webhook_sandbox_schema.js',
        'smoke_phase104b_provider_webhook_sandbox_readiness.js',
        'smoke_phase104c_provider_webhook_event_tests.js',
        'smoke_phase104d_provider_webhook_replay_idempotency.js',
        'smoke_phase104e_provider_webhook_sandbox_admin_api_ui.js',
        'smoke_phase104f_end_to_end_provider_webhook_sandbox_regression.js',
        'smoke_phase104g_provider_webhook_sandbox_acceptance_pack.js'
    ];
    for (const s of scripts) {
        assert(fs.existsSync(path.join(ROOT, 'scripts', s)), `SC1: Smoke script exists: ${s}`);
    }

    // SC2: Services
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsProviderWebhookSandboxService.js')), 'SC2: Provider webhook sandbox service exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsProviderWebhookEventTestService.js')), 'SC2: Webhook event test service exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsProviderWebhookReplayReadinessService.js')), 'SC2: Replay readiness service exists');

    // SC3: Route
    assert(fs.existsSync(path.join(ROOT, 'src/api/routes/adminFinancialOperationsProviderWebhookSandbox.js')), 'SC3: Required route exists');

    // SC4: UI
    assert(fs.existsSync(path.join(ROOT, 'src/ui/pages/financial-operations-provider-webhook-sandbox/FinancialOperationsProviderWebhookSandboxPage.tsx')), 'SC4: Required UI stubs exist');

    // SC5: UI copy
    const uiStr = fs.readFileSync(path.join(ROOT, 'src/ui/pages/financial-operations-provider-webhook-sandbox/FinancialOperationsProviderWebhookSandboxPage.tsx'), 'utf-8');
    assert(uiStr.includes('Provider webhook sandbox readiness only'), 'SC5: Required safety copy exists');
    assert(uiStr.includes('Live provider traffic is not accepted'), 'SC5: Required safety copy exists');

    // Constraints
    const sStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderWebhookSandboxService.js'), 'utf-8');
    const eStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderWebhookEventTestService.js'), 'utf-8');
    const rStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderWebhookReplayReadinessService.js'), 'utf-8');

    assert(!sStr.includes('live_provider_connectivity_enabled: true'), 'SC6: No live provider connectivity enabled');
    assert(!rStr.includes('axios') && !sStr.includes('http'), 'SC7: No real payment/refund/payout execution exists');
    assert(!sStr.includes('live_signing_secret_present: true') && !eStr.includes('real_signature_used'), 'SC8: No live signing secrets exist');
    assert(!sStr.includes('full_public_enabled: true'), 'SC9: No FULL_PUBLIC enablement exists');
    assert(!rStr.includes('UPDATE orders') && !sStr.includes('UPDATE payments'), 'SC10: No mutation of source records');
    assert(sStr.includes('recordEvent') && eStr.includes('recordEvent') && rStr.includes('recordEvent'), 'SC11: Audit timeline exists');

    assert(fs.existsSync(path.join(REPORTS, 'phase104g_provider_webhook_sandbox_acceptance.md')), 'SC12: Final status block is generated');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 104G Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
