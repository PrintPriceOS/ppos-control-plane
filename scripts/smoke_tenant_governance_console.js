require('dotenv').config();
const db = require('../src/api/services/mysqlClient');

async function checkTenant(tenantId, expected) {
    console.log(`\nChecking tenant: ${tenantId}`);
    
    // Check main tenant details
    const rows = await db.query(`SELECT type, plan_code, service_tier, access_level, limits_json FROM tenants WHERE id = ?`, [tenantId]);
    if (!rows || rows.length === 0) {
        console.error(`❌ Tenant ${tenantId} not found.`);
        return false;
    }
    
    const t = rows[0];
    let limits = {};
    try { limits = JSON.parse(t.limits_json); } catch(e) {}
    
    let pass = true;
    for (const [key, val] of Object.entries(expected)) {
        if (key === 'maxFileSizeMb' || key === 'maxJobSizeMb' || key === 'allowLargeUploads') {
            if (limits[key] !== val) {
                console.error(`❌ Mismatch for ${key}: Expected ${val}, got ${limits[key]}`);
                pass = false;
            } else {
                console.log(`✅ ${key} matches (${val})`);
            }
        } else {
            if (t[key] !== val) {
                console.error(`❌ Mismatch for ${key}: Expected ${val}, got ${t[key]}`);
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
