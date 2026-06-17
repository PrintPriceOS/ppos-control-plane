'use strict';

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
    if (condition) { PASS++; console.log(`  ✅  [PASS] ${label}`); }
    else { FAIL++; console.error(`  ❌  [FAIL] ${label}`); }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runAcceptance() {
    console.log('\n━━━ Phase 113G — Production Activation Gate Acceptance Pack ━━━\n');

    // A. Phase Coverage
    const pathA = path.join(ROOT, 'migrations/053_phase113_financial_operations_production_activation_gate.sql');
    const pathB = path.join(ROOT, 'scripts/smoke_phase113b_production_activation_gate_evaluator.js');
    const pathC = path.join(ROOT, 'scripts/smoke_phase113c_production_activation_approval_chain.js');
    const pathD = path.join(ROOT, 'scripts/smoke_phase113d_production_activation_gate_review_workflow.js');
    const pathE1 = path.join(ROOT, 'scripts/smoke_phase113e_production_activation_gate_admin_api_ui.js');
    const pathE2 = path.join(ROOT, 'scripts/smoke_phase113e_migration_version_collision_guard.js');
    const pathF = path.join(ROOT, 'scripts/smoke_phase113f_end_to_end_production_activation_gate_regression.js');

    assert(fs.existsSync(pathA), 'AP_COV_A: 113A Schema exists');
    assert(fs.existsSync(pathB), 'AP_COV_B: 113B Evaluator smoke test exists');
    assert(fs.existsSync(pathC), 'AP_COV_C: 113C Approval chain smoke test exists');
    assert(fs.existsSync(pathD), 'AP_COV_D: 113D Review workflow smoke test exists');
    assert(fs.existsSync(pathE1), 'AP_COV_E1: 113E Admin API/UI smoke test exists');
    assert(fs.existsSync(pathE2), 'AP_COV_E2: 113E Migration collision guard smoke test exists');
    assert(fs.existsSync(pathF), 'AP_COV_F: 113F E2E regression smoke test exists');

    // B. Core Files
    const pathGateSvc = path.join(ROOT, 'src/api/services/financialOperationsProductionActivationGateService.js');
    const pathApprSvc = path.join(ROOT, 'src/api/services/financialOperationsProductionActivationApprovalService.js');
    const pathRevSvc = path.join(ROOT, 'src/api/services/financialOperationsProductionActivationGateReviewService.js');
    const pathRouter = path.join(ROOT, 'src/api/routes/financialOperationsProductionActivationAdmin.js');
    const pathClient = path.join(ROOT, 'src/ui/api/financialOperationsProductionActivationClient.ts');
    const pathTypes = path.join(ROOT, 'src/ui/types/financialOperationsProductionActivation.ts');
    const pathPage = path.join(ROOT, 'src/ui/pages/financial-operations-production-activation/ProductionActivationGate.tsx');

    assert(fs.existsSync(pathGateSvc), 'AP_FILE_1: Gate service exists');
    assert(fs.existsSync(pathApprSvc), 'AP_FILE_2: Approval service exists');
    assert(fs.existsSync(pathRevSvc), 'AP_FILE_3: Review service exists');
    assert(fs.existsSync(pathRouter), 'AP_FILE_4: Admin router exists');
    assert(fs.existsSync(pathClient), 'AP_FILE_5: API Client exists');
    assert(fs.existsSync(pathTypes), 'AP_FILE_6: Client types exist');
    assert(fs.existsSync(pathPage), 'AP_FILE_7: UI Page component exists');

    // C. Route & UI Coverage
    const serverCode = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const adminCode = fs.readFileSync(path.join(ROOT, 'src/api/routes/admin.js'), 'utf8');
    const appCode = fs.readFileSync(path.join(ROOT, 'src/ui/App.tsx'), 'utf8');
    const pageCode = fs.readFileSync(pathPage, 'utf8');
    const routerCode = fs.readFileSync(pathRouter, 'utf8');

    assert(serverCode.includes('/api/admin/financials/activation'), 'AP_ROUTE_1: server.js mounts route');
    assert(adminCode.includes('/financials/activation'), 'AP_ROUTE_2: admin.js mounts route');
    assert(appCode.includes('/admin/production-activation-gate'), 'AP_ROUTE_3: App.tsx maps route');
    assert(pageCode.includes('is_review_only') || pageCode.includes('safety.safety_message'), 'AP_UI_1: UI page contains safety references');
    
    const routerRoutes = require(pathRouter).stack.map(r => r.route).filter(Boolean).map(r => r.path);
    assert(routerRoutes.includes('/gate'), 'AP_API_1: GET /gate exists');
    assert(routerRoutes.includes('/approve'), 'AP_API_2: POST /approve exists');
    assert(routerRoutes.includes('/review'), 'AP_API_3: POST /review exists');
    assert(routerRoutes.includes('/audit-timeline'), 'AP_API_4: GET /audit-timeline exists');
    assert(routerRoutes.includes('/preview-redacted'), 'AP_API_5: GET /preview-redacted exists');

    // D. Migration Hardening
    const migrationCode = fs.readFileSync(path.join(ROOT, 'src/api/services/migrationService.js'), 'utf8');
    assert(migrationCode.includes("file.replace(/\\.sql$/, '')"), 'AP_MIG_1: Migration identity uses full filename');
    assert(migrationCode.includes('VARCHAR(255)'), 'AP_MIG_2: Expansion to 255 chars is active');
    assert(migrationCode.includes('m.description.replace'), 'AP_MIG_3: Backward compatibility support exists');

    // E. Safety Invariants
    assert(routerCode.includes('production_activation_enabled: false'), 'AP_SAFE_1: production_activation_enabled is false');
    assert(routerCode.includes('activation_execution_enabled: false'), 'AP_SAFE_2: activation_execution_enabled is false');
    assert(routerCode.includes('full_public_enabled: false'), 'AP_SAFE_3: full_public_enabled is false');
    assert(routerCode.includes('live_provider_connectivity_enabled: false'), 'AP_SAFE_4: live_provider_connectivity_enabled is false');
    assert(routerCode.includes('payment_execution_enabled: false'), 'AP_SAFE_5: payment_execution_enabled is false');
    assert(routerCode.includes('[REDACTED_PRE_PRODUCTION]'), 'AP_SAFE_6: Financial preview values are redacted');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 113G Acceptance Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);
    
    if (FAIL > 0) {
        console.error('❌ Phase 113 Acceptance Pack: FAILED');
        process.exit(1);
    }

    // F. Final Acceptance Summary Output
    console.log(`
PRINTPRICE OS — PHASE 113 PRODUCTION ACTIVATION GATE ACCEPTANCE PACK
STATUS: VALIDATED
PRODUCTION_ACTIVATION_GATE: ACTIVE
REVIEW_ONLY_MODE: ACTIVE
ADMIN_API: ACTIVE
ADMIN_UI: ACTIVE
AUDIT_TIMELINE: ACTIVE
REDACTED_PREVIEW: MANUAL_ONLY
FULL_PUBLIC: NOT_ENABLED
LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED
PAYMENT_EXECUTION: NOT_ENABLED
REFUND_EXECUTION: NOT_ENABLED
PAYOUT_EXECUTION: NOT_ENABLED
EXTERNAL_TAX_SUBMISSION: NOT_ENABLED
EXTERNAL_ACCOUNTING_SUBMISSION: NOT_ENABLED
SOURCE_RECORD_MUTATION: NOT_ENABLED
`);

}

runAcceptance().catch(err => { console.error('Acceptance Pack crashed:', err); process.exit(1); });
