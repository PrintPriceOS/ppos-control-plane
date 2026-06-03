const mysql = require('mysql2/promise');

async function checkTenant(connection, tenantId, expected) {
    console.log(`\nChecking tenant: ${tenantId}`);
    
    // Check main tenant details
    const [tRows] = await connection.query(`SELECT type, plan_code, service_tier, access_level, limits_json FROM tenants WHERE id = ?`, [tenantId]);
    if (tRows.length === 0) {
        console.error(`❌ Tenant ${tenantId} not found.`);
        return false;
    }
    
    const t = tRows[0];
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
    
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'secret',
        database: process.env.DB_NAME || 'printpriceos',
        port: process.env.DB_PORT || 3306
    });
    
    let allPassed = true;
    
    const adminPassed = await checkTenant(connection, 'ppos-customer-1', {
        type: 'INTERNAL',
        plan_code: 'SYSTEM',
        service_tier: 'system',
        access_level: 'SYSTEM',
        maxFileSizeMb: 5120,
        maxJobSizeMb: 10240,
        allowLargeUploads: true
    });
    
    const demoPassed = await checkTenant(connection, 'ph-demo-123', {
        type: 'PRINTHOUSE',
        plan_code: 'FOUNDING_PRINTHOUSE',
        service_tier: 'enterprise',
        access_level: 'FULL',
        maxFileSizeMb: 1024,
        maxJobSizeMb: 2048,
        allowLargeUploads: true
    });
    
    await connection.end();
    
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
