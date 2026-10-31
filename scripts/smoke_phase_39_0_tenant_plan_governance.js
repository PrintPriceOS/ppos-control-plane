/**
 * scripts/smoke_phase_39_0_tenant_plan_governance.js
 * 
 * Smoke test for Phase 39.0 — Tenant Plan Governance / Commercial Entitlements.
 * Verifies matrices, services, route definitions, integrations, and business rules.
 */

require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('========================================================');
console.log('PPOS CONTROL PLANE — PHASE 39.0 SMOKE TEST');
console.log('========================================================\n');

// 1. Static File Assertions
console.log('--- Running Static File & Export Assertions ---');

const matrixPath = path.join(__dirname, '../src/api/services/tenantEntitlementMatrix.js');
const servicePath = path.join(__dirname, '../src/api/services/tenantPlanGovernanceService.js');
const routerPath = path.join(__dirname, '../src/api/routes/adminTenantGovernance.js');
const adminPath = path.join(__dirname, '../src/api/routes/admin.js');
const preflightPath = path.join(__dirname, '../src/api/routes/adminPreflight.js');
const ingestionPath = path.join(__dirname, '../src/api/services/productionFileIngestionService.js');
const clientApiFilePath = path.join(__dirname, '../src/ui/lib/adminApi.ts');

assert(fs.existsSync(matrixPath), 'tenantEntitlementMatrix.js must exist');
assert(fs.existsSync(servicePath), 'tenantPlanGovernanceService.js must exist');
assert(fs.existsSync(routerPath), 'adminTenantGovernance.js must exist');
assert(fs.existsSync(clientApiFilePath), 'adminApi.ts must exist');

const matrixCode = fs.readFileSync(matrixPath, 'utf8');
const serviceCode = fs.readFileSync(servicePath, 'utf8');
const routerCode = fs.readFileSync(routerPath, 'utf8');
const adminCode = fs.readFileSync(adminPath, 'utf8');
const preflightCode = fs.readFileSync(preflightPath, 'utf8');
const ingestionCode = fs.readFileSync(ingestionPath, 'utf8');
const clientApiCode = fs.readFileSync(clientApiFilePath, 'utf8');

// Assert matrix definitions
assert(matrixCode.includes('FREE'), 'Matrix contains FREE plan');
assert(matrixCode.includes('PRO'), 'Matrix contains PRO plan');
assert(matrixCode.includes('ENTERPRISE'), 'Matrix contains ENTERPRISE plan');
assert(matrixCode.includes('FOUNDING_PRINTHOUSE'), 'Matrix contains FOUNDING_PRINTHOUSE plan');
assert(matrixCode.includes('CUSTOM'), 'Matrix contains CUSTOM plan');
assert(matrixCode.includes('SYSTEM'), 'Matrix contains SYSTEM plan');
assert(matrixCode.includes('tenant_admin: false'), 'FREE plan has tenant_admin disabled/limited');

// Assert service methods
assert(serviceCode.includes('getTenantEntitlements'), 'Service defines getTenantEntitlements');
assert(serviceCode.includes('assignTenantPlan'), 'Service defines assignTenantPlan');
assert(serviceCode.includes('extendGracePeriod'), 'Service defines extendGracePeriod');
assert(serviceCode.includes('evaluateTenantAction'), 'Service defines evaluateTenantAction');
assert(serviceCode.includes('checkFileLimit'), 'Service defines checkFileLimit');
assert(serviceCode.includes('checkJobLimit'), 'Service defines checkJobLimit');
assert(serviceCode.includes('freezeExpiredGraceTenant'), 'Service defines freezeExpiredGraceTenant');

// Assert route mountings
assert(adminCode.includes('/tenant-governance'), 'admin.js mounts /tenant-governance');
assert(routerCode.includes('/:tenantId/entitlements'), 'Router defines entitlements route');
assert(routerCode.includes('/:tenantId/plan'), 'Router defines plan route');
assert(routerCode.includes('/:tenantId/grace/extend'), 'Router defines grace/extend route');
assert(routerCode.includes('/:tenantId/evaluate-action'), 'Router defines evaluate-action route');
assert(routerCode.includes('/:tenantId/check-file-limit'), 'Router defines check-file-limit route');
assert(routerCode.includes('/:tenantId/check-job-limit'), 'Router defines check-job-limit route');

// Assert Preflight uploads check file limits
assert(preflightCode.includes('checkFileLimit'), 'adminPreflight.js wires checkFileLimit');

// Assert Ingestion service is no longer hardcoding 500 MB as static size
assert(!ingestionCode.includes('this.maxFileSize = 500 * 1024 * 1024;'), 'productionFileIngestionService no longer hardcodes 500 MB limit in constructor');
assert(ingestionCode.includes('maxFileSize = limitMb * 1024 * 1024;'), 'productionFileIngestionService dynamically computes maxFileSize');

// Assert client functions
assert(clientApiCode.includes('getTenantEntitlements'), 'clientApi exports getTenantEntitlements');
assert(clientApiCode.includes('assignTenantPlan'), 'clientApi exports assignTenantPlan');
assert(clientApiCode.includes('extendTenantGrace'), 'clientApi exports extendTenantGrace');
assert(clientApiCode.includes('freezeTenantGraceIfExpired'), 'clientApi exports freezeTenantGraceIfExpired');

console.log('✅ Static assertions completed successfully.');

// Mock database layer
console.log('\n--- Running Business Rules & Entitlements Logic Tests ---');

const mysqlClient = require('../src/api/services/mysqlClient');
const matrixModule = require('../src/api/services/tenantEntitlementMatrix');
const service = require('../src/api/services/tenantPlanGovernanceService');

let mockTenants = {};
let mockEvents = [];

// Intercept MySQL Client
mysqlClient.query = async (sql, params) => {
    // SELECT ... FROM tenants WHERE id = ?
    if (sql.trim().startsWith('SELECT') && sql.includes('FROM tenants')) {
        const id = params[0];
        const tenant = mockTenants[id];
        return tenant ? [tenant] : [];
    }

    // UPDATE tenants SET ... WHERE id = ?
    if (sql.trim().startsWith('UPDATE') && sql.includes('tenants')) {
        const id = params[params.length - 1];
        const tenant = mockTenants[id] || { id };
        
        // Update columns
        if (sql.includes('plan_code = ?')) {
            tenant.plan_code = params[0];
            tenant.plan = params[1];
            tenant.commercial_status = params[2];
            tenant.access_level = params[3];
            tenant.grace_started_at = params[4];
            tenant.grace_ends_at = params[5];
            tenant.limits_json = params[6];
            tenant.entitlements_json = params[7];
            tenant.module_access_json = params[8];
            tenant.governance_notes_json = params[9];
        } else if (sql.includes('grace_extended_until = ?')) {
            tenant.grace_extended_until = params[0];
            tenant.governance_notes_json = params[1];
            tenant.commercial_status = 'GRACE';
        } else if (sql.includes("commercial_status = 'GRACE_EXPIRED'")) {
            tenant.commercial_status = 'GRACE_EXPIRED';
        }
        
        mockTenants[id] = tenant;
        return { affectedRows: 1 };
    }

    // INSERT INTO tenant_governance_events
    if (sql.trim().startsWith('INSERT INTO tenant_governance_events')) {
        mockEvents.push({
            tenant_id: params[0],
            event_type: params[1],
            actor_id: params[2],
            plan_code: params[3],
            commercial_status: params[4],
            action_code: params[5],
            blockers_json: params[6],
            warnings_json: params[7],
            reason: params[8],
            metadata_json: params[9]
        });
        return { insertId: mockEvents.length };
    }

    // INSERT INTO tenant_plan_history
    if (sql.includes('INSERT INTO tenant_plan_history')) {
        return { insertId: 1 };
    }

    return [];
};

async function runTests() {
    const actor = { userId: 'admin_smoke_tester' };
    
    // 1. Assign plan - Idempotency & Initialization
    console.log('1. Testing Plan Assignment...');
    
    mockTenants['tenant-1'] = {
        id: 'tenant-1',
        plan: 'FREE',
        plan_code: 'FREE',
        status: 'ACTIVE',
        commercial_status: 'ACTIVE'
    };

    let assign1 = await service.assignTenantPlan('tenant-1', 'PRO', actor, { reason: 'Upgrade to PRO' });
    assert.equal(assign1.ok, true);
    assert.equal(assign1.updated, true);
    assert.equal(mockTenants['tenant-1'].plan_code, 'PRO');
    assert.equal(mockTenants['tenant-1'].commercial_status, 'ACTIVE');

    // Idempotent assign
    let assign2 = await service.assignTenantPlan('tenant-1', 'PRO', actor, { reason: 'Upgrade to PRO' });
    assert.equal(assign2.ok, true);
    assert.equal(assign2.idempotent, true);
    console.log('   Plan assignment & Idempotency: OK');

    // 2. File and Job limits validation
    console.log('2. Testing File size limits per Plan...');
    const size15Mb = 15 * 1024 * 1024;
    const size100Mb = 100 * 1024 * 1024;
    const size780Mb = 780 * 1024 * 1024;
    const size1200Mb = 1200 * 1024 * 1024;

    // FREE plan: File Limit is 25 MB
    await service.assignTenantPlan('tenant-1', 'FREE', actor);
    let checkFree1 = await service.checkFileLimit('tenant-1', size15Mb);
    let checkFree2 = await service.checkFileLimit('tenant-1', size780Mb);
    assert.equal(checkFree1.ok, true, 'FREE allows 15 MB');
    assert.equal(checkFree2.ok, false, 'FREE blocks 780 MB');

    // PRO plan: File Limit is 150 MB
    await service.assignTenantPlan('tenant-1', 'PRO', actor);
    let checkPro1 = await service.checkFileLimit('tenant-1', size100Mb);
    let checkPro2 = await service.checkFileLimit('tenant-1', size780Mb);
    assert.equal(checkPro1.ok, true, 'PRO allows 100 MB');
    assert.equal(checkPro2.ok, false, 'PRO blocks 780 MB');

    // ENTERPRISE plan: File Limit is 1024 MB
    await service.assignTenantPlan('tenant-1', 'ENTERPRISE', actor);
    let checkEnt1 = await service.checkFileLimit('tenant-1', size780Mb);
    let checkEnt2 = await service.checkFileLimit('tenant-1', size1200Mb);
    assert.equal(checkEnt1.ok, true, 'ENTERPRISE allows 780 MB (strategic inlay)');
    assert.equal(checkEnt2.ok, false, 'ENTERPRISE blocks 1200 MB');

    // FOUNDING PRINTHOUSE: File Limit is 1024 MB
    await service.assignTenantPlan('tenant-1', 'FOUNDING_PRINTHOUSE', actor);
    let checkFounding1 = await service.checkFileLimit('tenant-1', size780Mb);
    let checkFounding2 = await service.checkFileLimit('tenant-1', size1200Mb);
    assert.equal(checkFounding1.ok, true, 'FOUNDING_PRINTHOUSE allows 780 MB');
    assert.equal(checkFounding2.ok, false, 'FOUNDING_PRINTHOUSE blocks 1200 MB');
    console.log('   File size limit validation: OK');

    // 3. Grace periods & Expired state freezes
    console.log('3. Testing Grace Period Logic and Action Freezes...');
    
    // Assign Founding Printhouse with 7-day grace period
    await service.assignTenantPlan('tenant-grace', 'FOUNDING_PRINTHOUSE', actor, { graceDays: 7 });
    
    // Validate entitlements during active grace
    let entActive = await service.getTenantEntitlements('tenant-grace');
    assert.equal(entActive.grace.active, true);
    assert.equal(entActive.grace.expired, false);
    assert.equal(entActive.grace.daysRemaining, 7);
    
    // Action: QUEUE_PRODUCTION allowed during grace
    let actionGrace = await service.evaluateTenantAction('tenant-grace', 'QUEUE_PRODUCTION');
    assert.equal(actionGrace.allowed, true, 'Mutating action allowed during grace');

    // Attempting to shorten grace period without force=true should fail
    await assert.rejects(
        service.extendGracePeriod('tenant-grace', actor, { graceDays: 3, reason: 'Shorten grace' }),
        /New grace period cannot be shorter than current grace period/,
        'Shortening grace without force fails'
    );

    // Force expire the grace ends_at
    mockTenants['tenant-grace'].grace_ends_at = new Date(Date.now() - 86400000); // 1 day ago
    mockTenants['tenant-grace'].commercial_status = 'GRACE'; // trigger auto freeze detect
    
    // Validate entitlements after expiration
    let entExpired = await service.getTenantEntitlements('tenant-grace');
    assert.equal(entExpired.grace.active, false);
    assert.equal(entExpired.grace.expired, true);
    assert.equal(entExpired.commercialStatus, 'GRACE_EXPIRED', 'Passive detection updated status to GRACE_EXPIRED');

    // Action evaluation when grace is expired
    let actionMutateBlocked = await service.evaluateTenantAction('tenant-grace', 'QUEUE_PRODUCTION');
    let actionLoginAllowed = await service.evaluateTenantAction('tenant-grace', 'LOGIN');
    let actionViewHistoryAllowed = await service.evaluateTenantAction('tenant-grace', 'VIEW_HISTORY');
    
    assert.equal(actionMutateBlocked.allowed, false, 'Mutating action blocked after grace expiration');
    assert.equal(actionLoginAllowed.allowed, true, 'LOGIN remains allowed after grace expiration');
    assert.equal(actionViewHistoryAllowed.allowed, true, 'VIEW_HISTORY remains allowed after grace expiration');
    console.log('   Grace expiration freezes: OK');

    // Grace extension check
    console.log('4. Testing Grace Period Extension...');
    
    // Succeeded grace extension
    let extension = await service.extendGracePeriod('tenant-grace', actor, { graceDays: 14, reason: 'Extend pilot duration' });
    assert.equal(extension.ok, true);
    
    let entExtended = await service.getTenantEntitlements('tenant-grace');
    assert.equal(entExtended.grace.active, true, 'Grace is active again after extension');
    assert.equal(entExtended.commercialStatus, 'GRACE');
    console.log('   Grace extension validation: OK');
}

runTests().then(() => {
    console.log('\n================================================================================');
    console.log('PHASE 39.0 — TENANT PLAN GOVERNANCE');
    console.log('STATUS: READY');
    console.log('RESULT: ENTITLEMENTS_AND_GRACE_GOVERNANCE_VALIDATED');
    console.log('BLOCKERS: NONE');
    console.log('================================================================================');
}).catch(err => {
    console.error('\n❌ Smoke test execution failed:', err);
    process.exit(1);
});
