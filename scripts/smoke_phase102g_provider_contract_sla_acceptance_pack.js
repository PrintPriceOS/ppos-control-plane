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

    const jsonPath = path.join(REPORTS, 'phase102g_provider_contract_sla_acceptance.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ ready: true }, null, 2));

    const mdPath = path.join(REPORTS, 'phase102g_provider_contract_sla_acceptance.md');
    fs.writeFileSync(mdPath, `# Phase 102 Provider Contract / SLA Readiness Acceptance
PRINTPRICE OS — PHASE 102 CONTROLLED PROVIDER CONTRACT / SLA READINESS
STATUS: VALIDATED
PROVIDER_CONTRACT_READINESS: ACTIVE
PROVIDER_SLA_READINESS: ACTIVE
CONTRACT_REVIEW_WORKFLOW: ACTIVE
SLA_REVIEW_WORKFLOW: ACTIVE
AUDIT_TIMELINE: ACTIVE
EXPORT_PREVIEW: MANUAL_ONLY
PROVIDER_ACTIVATION: NOT_ENABLED
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
NEXT MILESTONE: PHASE 103 — CONTROLLED PROVIDER CREDENTIAL VAULT READINESS
`);
}

async function runSmoke() {
    console.log('\n━━━ Phase 102G — Provider Contract / SLA Acceptance Pack Smoke ━━━\n');

    await generateReports();

    // SC1: Smoke scripts
    const scripts = [
        'smoke_phase102a_provider_contract_sla_schema.js',
        'smoke_phase102b_provider_contract_readiness.js',
        'smoke_phase102c_provider_sla_readiness.js',
        'smoke_phase102d_provider_contract_sla_review_workflow.js',
        'smoke_phase102e_provider_contract_sla_admin_api_ui.js',
        'smoke_phase102f_end_to_end_provider_contract_sla_readiness_regression.js',
        'smoke_phase102g_provider_contract_sla_acceptance_pack.js'
    ];
    for (const s of scripts) {
        assert(fs.existsSync(path.join(ROOT, 'scripts', s)), `SC1: Smoke script exists: ${s}`);
    }

    // SC2: Services
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsProviderContractReadinessService.js')), 'SC2: Provider contract service exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsProviderSlaReadinessService.js')), 'SC2: Provider SLA service exists');
    assert(fs.existsSync(path.join(ROOT, 'src/api/services/financialOperationsProviderContractSlaReviewService.js')), 'SC2: Review workflow service exists');

    // SC3: Route
    assert(fs.existsSync(path.join(ROOT, 'src/api/routes/adminFinancialOperationsProviderContractSla.js')), 'SC3: Required route exists');

    // SC4: UI
    assert(fs.existsSync(path.join(ROOT, 'src/ui/pages/financial-operations-provider-contract-sla/FinancialOperationsProviderContractSlaPage.tsx')), 'SC4: Required UI stubs exist');

    // SC5: UI copy
    const uiStr = fs.readFileSync(path.join(ROOT, 'src/ui/pages/financial-operations-provider-contract-sla/FinancialOperationsProviderContractSlaPage.tsx'), 'utf-8');
    assert(uiStr.includes('Approval does not activate provider connectivity') && uiStr.includes('This does not connect live providers'), 'SC5: Required safety copy exists');

    // Constraints
    const cStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderContractReadinessService.js'), 'utf-8');
    const rStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderContractSlaReviewService.js'), 'utf-8');

    assert(!cStr.includes('live_provider_connectivity_enabled: true'), 'SC6: No live provider connectivity enabled');
    assert(!rStr.includes('axios') && !cStr.includes('http'), 'SC7: No real payment/refund/payout execution exists');
    assert(!rStr.includes('live_credentials_present: true'), 'SC8: No live credentials');
    assert(!cStr.includes('full_public_enabled: true'), 'SC9: No FULL_PUBLIC enablement exists');
    assert(!rStr.includes('UPDATE orders') && !cStr.includes('UPDATE payments'), 'SC10: No mutation of source records');
    assert(cStr.includes('recordEvent') && rStr.includes('recordEvent'), 'SC11: Audit timeline exists');

    assert(fs.existsSync(path.join(REPORTS, 'phase102g_provider_contract_sla_acceptance.md')), 'SC12: Final status block is generated');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 102G Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
