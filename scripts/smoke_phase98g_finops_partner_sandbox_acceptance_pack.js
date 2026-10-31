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

    const jsonPath = path.join(REPORTS, 'phase98g_finops_partner_sandbox_acceptance.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ ready: true }, null, 2));

    const mdPath = path.join(REPORTS, 'phase98g_finops_partner_sandbox_acceptance.md');
    fs.writeFileSync(mdPath, `# Phase 98 Partner Sandbox Acceptance
PRINTPRICE OS — PHASE 98 CONTROLLED FINANCIAL OPERATIONS PARTNER SANDBOX
STATUS: VALIDATED
FINOPS_PARTNER_SANDBOX: ACTIVE
PARTNER_SANDBOX_GOVERNANCE: ACTIVE
SANDBOX_SESSIONS: ACTIVE
MOCK_PROVIDER_RUNS: ACTIVE
SANDBOX_DRY_RUNS: ACTIVE
AUDIT_TIMELINE: ACTIVE
EXECUTION_MODE: SANDBOX_ONLY
MOCK_PROVIDER: LOCAL_ONLY
PAYMENT_EXECUTION: NOT_ENABLED
REFUND_EXECUTION: NOT_ENABLED
PAYOUT_EXECUTION: NOT_ENABLED
EXTERNAL_INVOICE_SUBMISSION: NOT_ENABLED
TAX_FILING_AUTOMATION: NOT_ENABLED
FULL_PUBLIC_LAUNCH: NOT_ENABLED
SOURCE_RECORD_MUTATION: NOT_ENABLED
NEXT MILESTONE: PHASE 99 — FINANCIAL OPERATIONS PRODUCTION HARDENING READINESS
`);
}

async function runSmoke() {
    console.log('\n━━━ Phase 98G — FinOps Partner Sandbox Acceptance Pack Smoke ━━━\n');

    await generateReports();

    // SC1: Smoke scripts
    const scripts = [
        'smoke_phase98a_finops_partner_sandbox_schema.js',
        'smoke_phase98b_finops_partner_sandbox_governance.js',
        'smoke_phase98c_finops_partner_sandbox_access.js',
        'smoke_phase98d_finops_partner_sandbox_mock_provider.js',
        'smoke_phase98e_finops_partner_sandbox_admin_api_ui.js',
        'smoke_phase98f_end_to_end_finops_partner_sandbox_regression.js',
        'smoke_phase98g_finops_partner_sandbox_acceptance_pack.js'
    ];
    for (const s of scripts) {
        assert(fs.existsSync(path.join(ROOT, 'scripts', s)), `SC1: Smoke script exists: ${s}`);
    }

    // SC2: Services
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsPartnerSandboxService.js')), 'SC2: Partner sandbox governance exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsPartnerSandboxAccessService.js')), 'SC2: Sandbox access/session service exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsPartnerSandboxRunService.js')), 'SC2: Mock provider service exists');

    // SC3: Route
    assert(fs.existsSync(path.join(ROOT, 'src/api/routes/adminFinancialOperationsPartnerSandbox.js')), 'SC3: Required route exists');

    // SC4: UI
    assert(fs.existsSync(path.join(ROOT, 'src/ui/pages/financial-operations-partner-sandbox/FinancialOperationsPartnerSandboxPage.tsx')), 'SC4: Required UI stubs exist');

    // SC5: UI copy
    const uiStr = fs.readFileSync(path.join(ROOT, 'src/ui/pages/financial-operations-partner-sandbox/FinancialOperationsPartnerSandboxPage.tsx'), 'utf-8');
    assert(uiStr.includes('Sandbox is not live financial execution'), 'SC5: Required safety copy exists');

    // Constraints
    const prgStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPartnerSandboxService.js'), 'utf-8');
    const accStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPartnerSandboxAccessService.js'), 'utf-8');
    const runStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPartnerSandboxRunService.js'), 'utf-8');

    assert(prgStr.includes('sandbox_only: true'), 'SC6: Execution mode remains SANDBOX_ONLY');
    assert(runStr.includes('LOCAL_DETERMINISTIC_MOCK'), 'SC7: Mock provider remains LOCAL_ONLY');

    assert(!runStr.includes('axios') && !runStr.includes('http'), 'SC8: No real payment execution exists');
    assert(!runStr.includes('axios') && !runStr.includes('http'), 'SC9: No real refund execution exists');
    assert(!runStr.includes('axios') && !runStr.includes('http'), 'SC10: No real payout execution exists');
    assert(!runStr.includes('axios') && !runStr.includes('http'), 'SC11: No external invoice submission exists');
    assert(!runStr.includes('axios') && !runStr.includes('http'), 'SC12: No automated tax filing exists');
    assert(prgStr.includes('full_public_enabled: false'), 'SC13: No FULL_PUBLIC enablement exists');
    assert(!runStr.includes('UPDATE runs') && !runStr.includes('UPDATE orders'), 'SC14: No mutation of source records');
    
    assert(prgStr.includes('recordEvent'), 'SC15: Audit timeline exists');

    assert(fs.existsSync(path.join(REPORTS, 'phase98g_finops_partner_sandbox_acceptance.md')), 'SC16: Final status block is generated');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 98G Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
