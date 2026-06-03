require('dotenv').config();
const db = require('../src/api/services/mysqlClient');
const governanceService = require('../src/api/services/tenantPlanGovernanceService');

async function checkTenant(tenantId, expected) {
    console.log(`\nChecking tenant: ${tenantId}`);
    
    // Call the newly hardened method
    const tenant = await governanceService.getTenantState(tenantId);
    if (!tenant || tenant.plan_code === 'FREE' && expected.plan_code !== 'FREE') {
        console.error(`❌ Tenant ${tenantId} not found or defaulted to FREE incorrectly.`);
        // Note: getTenantState falls back to FREE if not found in DB
        return false;
    }
    
    const limits = tenant.effective_limits || {};
    
    let pass = true;
    for (const [key, val] of Object.entries(expected)) {
        if (key === 'maxFileSizeMb' || key === 'maxJobSizeMb' || key === 'allowLargeUploads') {
            if (limits[key] !== val) {
                console.error(`❌ Mismatch for effective_limits.${key}: Expected ${val}, got ${limits[key]}`);
                pass = false;
            } else {
                console.log(`✅ effective_limits.${key} matches (${val})`);
            }
        } else {
            if (tenant[key] !== val) {
                console.error(`❌ Mismatch for ${key}: Expected ${val}, got ${tenant[key]}`);
                pass = false;
            } else {
                console.log(`✅ ${key} matches (${val})`);
            }
        }
    }
    
    return pass;
}

async function runSmokeTest() {
    console.log('--- RUNNING TENANT GOVERNANCE SMOKE TEST ---');
    
    let allPassed = true;
    
    const adminPassed = await checkTenant('ppos-customer-1', {
        type: 'INTERNAL',
        plan_code: 'SYSTEM',
        service_tier: 'system',
        access_level: 'SYSTEM',
        maxFileSizeMb: 5120,
        maxJobSizeMb: 10240,
        allowLargeUploads: true
    });
    
    const demoPassed = await checkTenant('ph-demo-123', {
        type: 'PRINTHOUSE',
        plan_code: 'FOUNDING_PRINTHOUSE',
        service_tier: 'enterprise',
        access_level: 'FULL',
        maxFileSizeMb: 1024,
        maxJobSizeMb: 2048,
        allowLargeUploads: true
    });
    
    if (adminPassed && demoPassed) {
        console.log('\n✅ TENANT GOVERNANCE SMOKE TEST PASSED');
        process.exit(0);
    } else {
        console.error('\n❌ TENANT GOVERNANCE SMOKE TEST FAILED');
        process.exit(1);
    }
}

runSmokeTest().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
