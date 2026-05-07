/**
 * scripts/verify-control-plane-schema.js
 * 
 * Verifies that the required database tables and columns exist for the Control Plane.
 */

require('dotenv').config();
const mysql = require('../src/api/services/mysqlClient');

const REQUIRED_TABLES = [
    'tenants',
    'users',
    'printer_nodes',
    'production_notifications',
    'preflight_jobs',
    'preflight_artifacts',
    'api_audit_log'
];

const OPTIONAL_TABLES = [
    'printer_pricing_profiles',
    'printer_machines'
];

const REQUIRED_COLUMNS = [
    { table: 'printer_nodes', column: 'rates_json' },
    { table: 'printer_nodes', column: 'signatures' },
    { table: 'printer_nodes', column: 'limits' }
];

async function verifySchema() {
    console.log('--- CONTROL PLANE SCHEMA VERIFICATION ---');
    let hasFailures = false;

    try {
        const tables = await mysql.query('SHOW TABLES');
        const tableNames = tables.map(t => Object.values(t)[0]);

        console.log('\n[1] VERIFYING TABLES:');
        for (const table of REQUIRED_TABLES) {
            if (tableNames.includes(table)) {
                console.log(`  [PASS] ${table}`);
            } else {
                console.log(`  [FAIL] ${table} (MISSING)`);
                hasFailures = true;
            }
        }

        for (const table of OPTIONAL_TABLES) {
            if (tableNames.includes(table)) {
                console.log(`  [PASS] ${table} (Optional)`);
            } else {
                console.log(`  [WARN] ${table} (Optional module missing)`);
            }
        }

        console.log('\n[2] VERIFYING COLUMNS:');
        for (const { table, column } of REQUIRED_COLUMNS) {
            if (!tableNames.includes(table)) continue;

            const columns = await mysql.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
            if (columns.length > 0) {
                console.log(`  [PASS] ${table}.${column}`);
            } else {
                console.log(`  [FAIL] ${table}.${column} (MISSING)`);
                hasFailures = true;
            }
        }

        console.log('\n-----------------------------------------');
        if (hasFailures) {
            console.log('STATUS: FAILED (Missing required schema components)');
            process.exit(1);
        } else {
            console.log('STATUS: PASS');
            process.exit(0);
        }

    } catch (err) {
        console.error('ERROR during verification:', err.message);
        process.exit(1);
    }
}

verifySchema();
