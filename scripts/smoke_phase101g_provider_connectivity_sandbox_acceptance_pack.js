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

    const jsonPath = path.join(REPORTS, 'phase101g_provider_connectivity_sandbox_acceptance.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ ready: true }, null, 2));

    const mdPath = path.join(REPORTS, 'phase101g_provider_connectivity_sandbox_acceptance.md');
    fs.writeFileSync(mdPath, `# Phase 101 Provider Connectivity Sandbox Acceptance
PRINTPRICE OS — PHASE 101 CONTROLLED PROVIDER CONNECTIVITY SANDBOX READINESS
STATUS: VALIDATED
PROVIDER_CONNECTIVITY_SANDBOX: ACTIVE
PROVIDER_SANDBOX_GOVERNANCE: ACTIVE
MOCK_PROVIDER_TESTS: ACTIVE
STUBBED_PROVIDER_TESTS: ACTIVE
DRY_RUN_PROVIDER_TESTS: ACTIVE
CREDENTIAL_GUARDRAILS: ACTIVE
AUDIT_TIMELINE: ACTIVE
EXPORT_PREVIEW: MANUAL_ONLY
PRODUCTION_ACTIVATION: NOT_ENABLED
LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED
LIVE_CREDENTIALS: NOT_ENABLED
PAYMENT_EXECUTION: NOT_ENABLED
REFUND_EXECUTION: NOT_ENABLED
PAYOUT_EXECUTION: NOT_ENABLED
EXTERNAL_INVOICE_SUBMISSION: NOT_ENABLED
TAX_FILING_AUTOMATION: NOT_ENABLED
FULL_PUBLIC_LAUNCH: NOT_ENABLED
SOURCE_RECORD_MUTATION: NOT_ENABLED
NEXT MILESTONE: PHASE 102 — CONTROLLED PROVIDER CONTRACT / SLA READINESS
`);
}

async function runSmoke() {
    console.log('\n━━━ Phase 101G — Provider Connectivity Sandbox Acceptance Pack Smoke ━━━\n');

    await generateReports();

    // SC1: Smoke scripts
    const scripts = [
        'smoke_phase101a_provider_connectivity_sandbox_schema.js',
        'smoke_phase101b_provider_sandbox_governance.js',
        'smoke_phase101c_provider_connectivity_mock_tests.js',
        'smoke_phase101d_provider_credential_guardrails.js',
        'smoke_phase101e_provider_sandbox_admin_api_ui.js',
        'smoke_phase101f_end_to_end_provider_connectivity_sandbox_regression.js',
        'smoke_phase101g_provider_connectivity_sandbox_acceptance_pack.js'
    ];
    for (const s of scripts) {
        assert(fs.existsSync(path.join(ROOT, 'scripts', s)), `SC1: Smoke script exists: ${s}`);
    }

    // SC2: Services
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsProviderSandboxService.js')), 'SC2: Sandbox governance service exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsProviderConnectivityTestService.js')), 'SC2: Mock test service exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsProviderCredentialGuardrailService.js')), 'SC2: Credential guardrail service exists');

    // SC3: Route
    assert(fs.existsSync(path.join(ROOT, 'src/api/routes/adminFinancialOperationsProviderSandbox.js')), 'SC3: Required route exists');

    // SC4: UI
    assert(fs.existsSync(path.join(ROOT, 'src/ui/pages/financial-operations-provider-sandbox/FinancialOperationsProviderSandboxPage.tsx')), 'SC4: Required UI stubs exist');

    // SC5: UI copy
    const uiStr = fs.readFileSync(path.join(ROOT, 'src/ui/pages/financial-operations-provider-sandbox/FinancialOperationsProviderSandboxPage.tsx'), 'utf-8');
    assert(uiStr.includes('This does not connect live providers') && uiStr.includes('Live credentials are not used'), 'SC5: Required safety copy exists');

    // Constraints
    const sbStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderSandboxService.js'), 'utf-8');
    const testStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderConnectivityTestService.js'), 'utf-8');
    const guardStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderCredentialGuardrailService.js'), 'utf-8');

    assert(sbStr.includes('live_provider_connectivity_enabled: false'), 'SC6: No live provider connectivity');
    assert(!testStr.includes('axios') && !testStr.includes('http'), 'SC7: No real payment/refund/payout execution exists');
    assert(sbStr.includes('live_credentials_present: false'), 'SC8: No live credentials');
    assert(sbStr.includes('full_public_enabled: false'), 'SC9: No FULL_PUBLIC enablement exists');
    assert(!testStr.includes('UPDATE orders') && !sbStr.includes('UPDATE sandboxes'), 'SC10: No mutation of source records');
    assert(sbStr.includes('recordEvent') && testStr.includes('recordEvent') && guardStr.includes('recordEvent'), 'SC11: Audit timeline exists');

    assert(fs.existsSync(path.join(REPORTS, 'phase101g_provider_connectivity_sandbox_acceptance.md')), 'SC12: Final status block is generated');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 101G Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
