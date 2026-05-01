/**
 * scripts/verify-industrial-schema.js
 * 
 * Verifies that the industrial operation tables exist in production without mutating.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function verify() {
    console.log('[VERIFY] Starting Industrial Schema Verification...');
    
    const connection = await mysql.createConnection({
        host: process.env.PPOS_DB_HOST,
        user: process.env.PPOS_DB_USER,
        password: process.env.PPOS_DB_PASSWORD,
        database: process.env.PPOS_DB_NAME,
        port: process.env.PPOS_DB_PORT || 3306
    });

    const tables = [
        'preflight_artifacts',
        'worker_nodes',
        'operational_incidents',
        'lifecycle_policies'
    ];

    let allPass = true;

    for (const table of tables) {
        try {
            const [rows] = await connection.query(`SHOW TABLES LIKE '${table}'`);
            if (rows.length > 0) {
                console.log(`[PASS] Table exists: ${table}`);
            } else {
                console.error(`[FAIL] Table MISSING: ${table}`);
                allPass = false;
            }
        } catch (err) {
            console.error(`[ERROR] Failed to check table ${table}:`, err.message);
            allPass = false;
        }
    }

    await connection.end();

    if (allPass) {
        console.log('[SUCCESS] All Industrial Operation tables are present.');
        process.exit(0);
    } else {
        console.error('[CRITICAL] Schema verification FAILED. Some tables are missing.');
        process.exit(1);
    }
}

verify().catch(err => {
    console.error('[FATAL] Verification script failed:', err);
    process.exit(1);
});
