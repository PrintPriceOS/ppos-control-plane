/**
 * scripts/smoke_phase_39_2_tenant_management_console.js
 * 
 * Smoke test for Phase 39.2.1 — Tenant Route Wiring Fix.
 * Verifies App.tsx routing entries, UI table implementation, client functions, backend routes, 
 * drawer actions, and 780 MB allowance verification path.
 */

require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('========================================================');
console.log('PPOS CONTROL PLANE — PHASE 39.2.1 ROUTE WIRING SMOKE TEST');
console.log('========================================================\n');

// 1. Static File & Routing Assertions
console.log('--- Running Static File & Routing Assertions ---');

const appPath = path.join(__dirname, '../src/ui/App.tsx');
const uiViewPath = path.join(__dirname, '../src/ui/pages/admin/TenantManagement.tsx');
const drawerPath = path.join(__dirname, '../src/ui/components/TenantDetailDrawer.tsx');
const clientApiPath = path.join(__dirname, '../src/ui/lib/adminApi.ts');
const routerPath = path.join(__dirname, '../src/api/routes/adminTenantGovernance.js');

assert(fs.existsSync(appPath), 'App.tsx must exist');
assert(fs.existsSync(uiViewPath), 'TenantManagement.tsx must exist');
assert(fs.existsSync(drawerPath), 'TenantDetailDrawer.tsx must exist');
assert(fs.existsSync(clientApiPath), 'adminApi.ts must exist');
assert(fs.existsSync(routerPath), 'adminTenantGovernance.js must exist');

const appCode = fs.readFileSync(appPath, 'utf8');
const uiCode = fs.readFileSync(uiViewPath, 'utf8');
const drawerCode = fs.readFileSync(drawerPath, 'utf8');
const apiCode = fs.readFileSync(clientApiPath, 'utf8');
const routerCode = fs.readFileSync(routerPath, 'utf8');

// App.tsx assertions
assert(appCode.includes("import TenantManagement from './pages/admin/TenantManagement'"), 'App.tsx imports TenantManagement');
assert(appCode.includes('<Route path="/tenants" element={<TenantManagement />} />'), 'App.tsx routes /tenants to TenantManagement');
assert(!appCode.includes('<Route path="/tenants" element={<TenantsPage />} />'), 'App.tsx does not route /tenants to TenantsPage');

// UI View assertions
assert(uiCode.includes('listTenantGovernance'), 'TenantManagement.tsx imports/uses listTenantGovernance');
assert(uiCode.includes('Plan Code'), 'TenantManagement.tsx contains "Plan Code" label');
assert(uiCode.includes('Commercial Status'), 'TenantManagement.tsx contains "Commercial Status" label');
assert(uiCode.includes('Access Level'), 'TenantManagement.tsx contains "Access Level" label');
assert(uiCode.includes('Grace'), 'TenantManagement.tsx contains "Grace" label');
assert(uiCode.includes('File Limit'), 'TenantManagement.tsx contains "File Limit" label');
assert(uiCode.includes('Job Limit'), 'TenantManagement.tsx contains "Job Limit" label');

// Drawer elements and action assertions
assert(drawerCode.includes('Identity Context'), 'Drawer has Identity section');
assert(drawerCode.includes('Commercial Governance'), 'Drawer has Commercial Governance section');
assert(drawerCode.includes('Limits Registry'), 'Drawer has Limits section');
assert(drawerCode.includes('Module Entitlements'), 'Drawer has Modules list');
assert(drawerCode.includes('Allowed Actions'), 'Drawer has Actions list');
assert(drawerCode.includes('handleAssignPlan') || drawerCode.includes('assignTenantPlan'), 'Drawer has Assign Plan handler');
assert(drawerCode.includes('handleExtendGrace') || drawerCode.includes('extendTenantGrace'), 'Drawer has Extend Grace handler');
assert(drawerCode.includes('handleFreeze') || drawerCode.includes('freezeTenantGraceIfExpired'), 'Drawer has Freeze handler');
assert(drawerCode.includes('handleCheckFileLimit') || drawerCode.includes('checkTenantFileLimit'), 'Drawer has Check File Limit handler');
assert(drawerCode.includes('handleCheckJobLimit') || drawerCode.includes('checkTenantJobLimit'), 'Drawer has Check Job Limit handler');

// Assert API Client exports
assert(apiCode.includes('listTenantGovernance'), 'adminApi.ts exports listTenantGovernance');

// Assert Backend Router
assert(routerCode.includes("router.get('/',"), 'adminTenantGovernance.js defines GET / listing route');

console.log('✅ Routing and static assertions completed successfully.');

// 2. Logic and Database Mocks Check
console.log('\n--- Running Business Logic & Integration Tests ---');

const mysqlClient = require('../src/api/services/mysqlClient');
const service = require('../src/api/services/tenantPlanGovernanceService');

let mockTenants = {};

// Intercept database query calls
mysqlClient.query = async (sql, params) => {
    if (sql.trim().startsWith('SELECT') && sql.includes('FROM tenants')) {
        if (sql.includes('WHERE id = ?')) {
            const id = params[0];
            const tenant = mockTenants[id];
            return tenant ? [tenant] : [];
        }
        return Object.values(mockTenants);
    }
    if (sql.trim().startsWith('UPDATE') && sql.includes('tenants')) {
        const id = params[params.length - 1];
        if (mockTenants[id]) {
            if (sql.includes('plan_code = ?')) {
                mockTenants[id].plan_code = params[0];
                mockTenants[id].plan = params[1];
                mockTenants[id].commercial_status = params[2];
                mockTenants[id].access_level = params[3];
                mockTenants[id].grace_started_at = params[4];
                mockTenants[id].grace_ends_at = params[5];
                mockTenants[id].limits_json = params[6];
                mockTenants[id].entitlements_json = params[7];
                mockTenants[id].module_access_json = params[8];
            }
        }
        return { affectedRows: 1 };
    }
    return [];
};

async function testBusinessLogic() {
    const actor = { userId: 'admin_smoke_tester' };
    
    // Seed ph-demo-123 static mock
    mockTenants['ph-demo-123'] = {
        id: 'ph-demo-123',
        name: 'Founding Pilot Printhouse',
        status: 'ACTIVE',
        plan: 'ENTERPRISE',
        plan_code: 'FOUNDING_PRINTHOUSE',
        commercial_status: 'GRACE',
        access_level: 'FULL',
        grace_started_at: new Date(),
        grace_ends_at: new Date(Date.now() + 7 * 86400000),
        limits_json: JSON.stringify({
            maxFileSizeMb: 1024,
            maxJobSizeMb: 2048,
            maxJobsPerMonth: 5000,
            retentionDays: 90
        }),
        module_access_json: JSON.stringify({
            budget_app: true,
            basic_preflight: true,
            full_preflight: true,
            marketplace_orders: true,
            file_repository: true,
            print_house_handoff: true,
            production_readiness: true,
            production_queue: true,
            machine_assignment: true,
            federation_telemetry: true,
            dispatch_orchestration: true,
            api_access: true,
            advanced_audit: true,
            tenant_admin: true
        })
    };

    console.log('Verifying ph-demo-123 limits configuration...');
    const entitlements = await service.getTenantEntitlements('ph-demo-123', actor);
    assert.equal(entitlements.planCode, 'FOUNDING_PRINTHOUSE', 'planCode is FOUNDING_PRINTHOUSE');
    assert.equal(entitlements.commercialStatus, 'GRACE', 'commercialStatus is GRACE');
    assert.equal(entitlements.limits.maxFileSizeMb, 1024, 'maxFileSizeMb is 1024 MB');
    assert.equal(entitlements.limits.maxJobSizeMb, 2048, 'maxJobSizeMb is 2048 MB');

    console.log('Testing 780 MB file allowance check for ph-demo-123 (strategic inlay check)...');
    const check780Mb = await service.checkFileLimit('ph-demo-123', 780 * 1024 * 1024);
    assert.equal(check780Mb.ok, true, '780 MB file upload should be allowed for ph-demo-123');

    console.log('Testing 1200 MB file block check for ph-demo-123...');
    const check1200Mb = await service.checkFileLimit('ph-demo-123', 1200 * 1024 * 1024);
    assert.equal(check1200Mb.ok, false, '1200 MB file upload should be blocked for ph-demo-123');

    console.log('✅ Business logic tests completed successfully.');
}

testBusinessLogic().then(() => {
    console.log('\n================================================================================');
    console.log('PHASE 39.2.1 — TENANT ROUTE WIRING FIX');
    console.log('STATUS: READY');
    console.log('RESULT: TENANT_ROUTE_POINTS_TO_GOVERNANCE_CONSOLE');
    console.log('BLOCKERS: NONE');
    console.log('================================================================================');
}).catch(err => {
    console.error('\n❌ Smoke test execution failed:', err);
    process.exit(1);
});
