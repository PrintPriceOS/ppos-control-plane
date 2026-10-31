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

async function runSmoke() {
    console.log('\n━━━ Phase 113E — Production Activation Gate Admin API & UI Smoke ━━━\n');

    // 1. Verify file existence
    const routerPath = path.join(ROOT, 'src/api/routes/financialOperationsProductionActivationAdmin.js');
    assert(fs.existsSync(routerPath), 'UI1: Admin router exists');

    const clientPath = path.join(ROOT, 'src/ui/api/financialOperationsProductionActivationClient.ts');
    assert(fs.existsSync(clientPath), 'UI2: Frontend API client exists');

    const typesPath = path.join(ROOT, 'src/ui/types/financialOperationsProductionActivation.ts');
    assert(fs.existsSync(typesPath), 'UI3: Frontend TypeScript types exist');

    const uiPath = path.join(ROOT, 'src/ui/pages/financial-operations-production-activation/ProductionActivationGate.tsx');
    assert(fs.existsSync(uiPath), 'UI4: Frontend Page component exists');

    const notifierPath = path.join(ROOT, 'src/api/services/notifier.js');
    assert(fs.existsSync(notifierPath), 'UI5: notifier.js adapter exists');

    const policyEnginePath = path.join(ROOT, 'src/api/services/policyEngine.js');
    assert(fs.existsSync(policyEnginePath), 'UI6: policyEngine.js adapter exists');

    // 2. Check package.json description
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert(pkg.description === "PrintPrice OS — Control Plane (Phase 113: Controlled Financial Operations Production Activation Gate)", 'UI7: package.json description updated');

    // 3. Test router syntax and safety markers
    try {
        const router = require(routerPath);
        assert(typeof router === 'function', 'UI8: Router exported as express middleware');

        const code = fs.readFileSync(routerPath, 'utf8');
        assert(code.includes('is_review_only: true'), 'UI9: Safety marker is_review_only is true');
        assert(code.includes('production_activation_enabled: false'), 'UI10: Safety marker production_activation_enabled is false');
        assert(code.includes('activation_execution_enabled: false'), 'UI11: Safety marker activation_execution_enabled is false');
        assert(code.includes('full_public_enabled: false'), 'UI12: Safety marker full_public_enabled is false');
        assert(code.includes('live_provider_connectivity_enabled: false'), 'UI13: Safety marker live_provider_connectivity_enabled is false');
        assert(code.includes('payment_execution_enabled: false'), 'UI14: Safety marker payment_execution_enabled is false');

        // Test mock endpoints handling
        // Get the stack of routes
        const routes = router.stack.map(r => r.route).filter(Boolean);
        const paths = routes.map(r => r.path);
        
        assert(paths.includes('/gate'), 'UI15: GET /gate path registered');
        assert(paths.includes('/approve'), 'UI16: POST /approve path registered');
        assert(paths.includes('/review'), 'UI17: POST /review path registered');
        assert(paths.includes('/audit-timeline'), 'UI18: GET /audit-timeline path registered');
        assert(paths.includes('/preview-redacted'), 'UI19: GET /preview-redacted path registered');

    } catch (err) {
        FAIL++;
        console.error('  ❌  [FAIL] Failed to load or verify router:', err.message);
    }

    // 4. Test service imports & code cleanups
    try {
        const serverCode = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
        assert(serverCode.includes('/api/admin/financials/activation'), 'UI20: Router registered in server.js');

        const adminRouterCode = fs.readFileSync(path.join(ROOT, 'src/api/routes/admin.js'), 'utf8');
        assert(adminRouterCode.includes('/financials/activation'), 'UI21: Router registered in admin.js');

        const productionDispatchAdminCode = fs.readFileSync(path.join(ROOT, 'src/api/routes/productionDispatchAdmin.js'), 'utf8');
        assert(productionDispatchAdminCode.includes('ManufacturingEvidenceLedgerService'), 'UI22: productionDispatchAdmin.js clean imports check');

        const autonomousRerouteCode = fs.readFileSync(path.join(ROOT, 'src/api/services/dispatch/AutonomousRerouteService.js'), 'utf8');
        assert(autonomousRerouteCode.includes('ManufacturingEvidenceLedgerService'), 'UI23: AutonomousRerouteService.js clean imports check');

        const aiAuditModalCode = fs.readFileSync(path.join(ROOT, 'src/ui/components/AIAuditModal.tsx'), 'utf8');
        assert(aiAuditModalCode.includes('./PreflightDropzone'), 'UI24: AIAuditModal.tsx clean imports check');

        const reportServiceCode = fs.readFileSync(path.join(ROOT, 'src/api/services/reportService.js'), 'utf8');
        assert(reportServiceCode.includes("require('./policyEngine')"), 'UI25: reportService.js require points to local safe adapter');

        const notifierAdapter = require(notifierPath);
        assert(typeof notifierAdapter.notifyTenantEvent === 'function', 'UI26: Notifier adapter implements notifyTenantEvent');
    } catch (err) {
        FAIL++;
        console.error('  ❌  [FAIL] Failed to verify service integrity or imports:', err.message);
    }

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 113E UI & API Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);
    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => { console.error('Smoke crashed:', err); process.exit(1); });
