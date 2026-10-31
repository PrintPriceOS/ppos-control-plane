/**
 * scripts/inspect_test_db_schema.js
 *
 * READ-ONLY Test Database Schema Inspection Tool
 * Target DB: pposrcmdw0qdtest on 127.0.0.1:3306
 * User: ppos_rc_mdw0qd@127.0.0.1
 *
 * STRICT GUARANTEES:
 * 1. Read-only session: Sets 'SET SESSION TRANSACTION READ ONLY' upon connection.
 * 2. Pure inspection queries: SHOW TABLES, DESCRIBE, SHOW INDEX, and SELECT from information_schema only.
 * 3. ZERO writes, ZERO mutations, ZERO test executions, ZERO side-effects.
 * 4. Password safety: Never outputs, echoes, or logs database credentials.
 * 5. Target Coverage: Exactly audits the 10 real tables consulted by the calibration and onboarding harness:
 *    - tenants
 *    - printer_nodes
 *    - control_users
 *    - user_sessions
 *    - printhouse_pricing_calibration_sessions
 *    - printhouse_pricing_calibration_runs
 *    - printhouse_pricing_calibration_acceptances
 *    - printhouse_pricing_revisions
 *    - bpe_pricing_publications
 *    - printhouse_activation_grants
 */

'use strict';

const mysql = require('mysql2/promise');

const REQUIRED_CONFIG = {
    host: '127.0.0.1',
    port: 3306,
    user: 'ppos_rc_mdw0qd',
    database: 'pposrcmdw0qdtest'
};

const TARGET_TABLES = [
    'tenants',
    'printer_nodes',
    'control_users',
    'user_sessions',
    'printhouse_pricing_calibration_sessions',
    'printhouse_pricing_calibration_runs',
    'printhouse_pricing_calibration_acceptances',
    'printhouse_pricing_revisions',
    'bpe_pricing_publications',
    'printhouse_activation_grants'
];

async function inspectSchema() {
    console.log('=== PPOS CONTROL PLANE: READ-ONLY SCHEMA INSPECTION ===');
    console.log(`Target: ${REQUIRED_CONFIG.user}@${REQUIRED_CONFIG.host}:${REQUIRED_CONFIG.port}/${REQUIRED_CONFIG.database}\n`);

    const password = process.env.PPOS_TEST_MYSQL_PASSWORD || process.env.TEST_MYSQL_PASSWORD;
    if (!password) {
        console.error('[FATAL] Missing required environment variable: PPOS_TEST_MYSQL_PASSWORD (or TEST_MYSQL_PASSWORD)');
        console.error('Execute this script in the server environment where isolated test credentials are set.');
        console.error('Example: PPOS_TEST_MYSQL_PASSWORD="***" node scripts/inspect_test_db_schema.js');
        process.exit(1);
    }

    let connection;
    try {
        connection = await mysql.createConnection({
            host: REQUIRED_CONFIG.host,
            port: REQUIRED_CONFIG.port,
            user: REQUIRED_CONFIG.user,
            password: password,
            database: REQUIRED_CONFIG.database,
            connectTimeout: 5000
        });
    } catch (err) {
        console.error('[CONNECTION FAILED]', err.message);
        process.exit(1);
    }

    try {
        // Enforce Read-Only session mode in MySQL
        await connection.query('SET SESSION TRANSACTION READ ONLY');

        // 1. Positive Identity & Database confirmation
        const [[identity]] = await connection.query('SELECT CURRENT_USER() AS user, DATABASE() AS db, VERSION() AS version');
        console.log(`[IDENTITY CONFIRMED] DB: ${identity.db} | User: ${identity.user} | MySQL: ${identity.version}\n`);

        if (identity.db !== REQUIRED_CONFIG.database) {
            throw new Error(`CRITICAL: Connected to database "${identity.db}" instead of expected "${REQUIRED_CONFIG.database}"`);
        }
        if (!identity.user.startsWith(REQUIRED_CONFIG.user)) {
            throw new Error(`CRITICAL: Connected as user "${identity.user}" instead of expected "${REQUIRED_CONFIG.user}"`);
        }

        // 2. Discover all existing tables
        const [tableRows] = await connection.query('SHOW TABLES');
        const existingTables = new Set(tableRows.map(r => Object.values(r)[0]));
        console.log(`[TOTAL TABLES DISCOVERED] ${existingTables.size} tables in database.\n`);

        // 3. Inspect the 10 target tables in strict detail
        console.log('================================================================================');
        console.log('=== DETAILED AUDIT OF THE 10 HARNESS TARGET TABLES ===');
        console.log('================================================================================');

        let missingCount = 0;

        for (const tbl of TARGET_TABLES) {
            const exists = existingTables.has(tbl);
            console.log(`\nTable: \`${tbl}\` -> ${exists ? 'EXISTS [OK]' : 'MISSING [CRITICAL]'}`);

            if (!exists) {
                missingCount++;
                continue;
            }

            // Columns
            const [columns] = await connection.query(`DESCRIBE \`${tbl}\``);
            console.log('  Columns:');
            for (const col of columns) {
                const nullStr = col.Null === 'YES' ? 'NULL' : 'NOT NULL';
                const keyStr = col.Key ? `[${col.Key}]` : '     ';
                const defStr = col.Default !== null ? `DEFAULT: ${col.Default}` : '';
                const extraStr = col.Extra ? `(${col.Extra})` : '';
                console.log(`    - ${col.Field.padEnd(36)} ${col.Type.padEnd(22)} ${nullStr.padEnd(9)} ${keyStr} ${defStr} ${extraStr}`);
            }

            // Indexes
            const [indexes] = await connection.query(`SHOW INDEX FROM \`${tbl}\``);
            const indexMap = new Map();
            for (const idx of indexes) {
                if (!indexMap.has(idx.Key_name)) {
                    indexMap.set(idx.Key_name, { unique: idx.Non_unique === 0, columns: [] });
                }
                indexMap.get(idx.Key_name).columns.push(idx.Column_name);
            }
            console.log('  Indexes:');
            for (const [name, info] of indexMap.entries()) {
                const typeStr = info.unique ? 'UNIQUE ' : 'INDEX  ';
                console.log(`    - ${typeStr} \`${name}\` (${info.columns.join(', ')})`);
            }

            // Foreign Key Constraints from information_schema
            const [fks] = await connection.query(`
                SELECT 
                    k.CONSTRAINT_NAME,
                    k.COLUMN_NAME,
                    k.REFERENCED_TABLE_NAME,
                    k.REFERENCED_COLUMN_NAME,
                    r.UPDATE_RULE,
                    r.DELETE_RULE
                FROM information_schema.KEY_COLUMN_USAGE k
                JOIN information_schema.REFERENTIAL_CONSTRAINTS r
                  ON k.CONSTRAINT_SCHEMA = r.CONSTRAINT_SCHEMA
                 AND k.CONSTRAINT_NAME = r.CONSTRAINT_NAME
                WHERE k.TABLE_SCHEMA = ?
                  AND k.TABLE_NAME = ?
                  AND k.REFERENCED_TABLE_NAME IS NOT NULL
            `, [REQUIRED_CONFIG.database, tbl]);

            if (fks.length > 0) {
                console.log('  Foreign Key Constraints:');
                for (const fk of fks) {
                    console.log(`    - CONSTRAINT \`${fk.CONSTRAINT_NAME}\`: \`${tbl}\`.\`${fk.COLUMN_NAME}\` -> \`${fk.REFERENCED_TABLE_NAME}\`.\`${fk.REFERENCED_COLUMN_NAME}\` (ON UPDATE ${fk.UPDATE_RULE}, ON DELETE ${fk.DELETE_RULE})`);
                }
            } else {
                console.log('  Foreign Key Constraints: NONE (enforced at application layer)');
            }
        }

        // 4. Invariant Checks for Harness Contracts
        console.log('\n================================================================================');
        console.log('=== HARNESS CONTRACT INVARIANT EVALUATION ===');
        console.log('================================================================================');

        if (existingTables.has('printer_nodes')) {
            const [pCols] = await connection.query('DESCRIBE printer_nodes');
            const colNames = pCols.map(c => c.Field);
            const hasRatesJson = colNames.includes('rates_json');
            const hasRatesChecksum = colNames.includes('rates_checksum');
            console.log(`- printer_nodes.rates_json:     ${hasRatesJson ? 'PRESENT [OK]' : 'MISSING [FAIL]'}`);
            console.log(`- printer_nodes.rates_checksum: ${hasRatesChecksum ? 'PRESENT (Warning: Column exists)' : 'ABSENT [OK - Harness must compute checksum from rates_json]'}`);
        }

        if (existingTables.has('control_users')) {
            const [uCols] = await connection.query('DESCRIBE control_users');
            const idCol = uCols.find(c => c.Field === 'id');
            const isAutoInc = idCol && idCol.Extra.includes('auto_increment');
            console.log(`- control_users.id:             ${idCol ? idCol.Type : 'MISSING'} (auto_increment: ${isAutoInc ? 'YES [OK]' : 'NO [FAIL]'})`);
        }

        if (existingTables.has('user_sessions')) {
            const [sCols] = await connection.query('DESCRIBE user_sessions');
            const sColMap = new Map(sCols.map(c => [c.Field, c]));
            console.log(`- user_sessions.id (session ID): ${sColMap.has('id') ? `${sColMap.get('id').Type} [OK]` : 'MISSING [FAIL]'}`);
            console.log(`- user_sessions.user_id:        ${sColMap.has('user_id') ? `${sColMap.get('user_id').Type} [OK]` : 'MISSING [FAIL]'}`);
            console.log(`- user_sessions.tenant_id:      ${sColMap.has('tenant_id') ? `${sColMap.get('tenant_id').Type} [OK]` : 'MISSING [FAIL]'}`);
        }

        if (missingCount > 0) {
            console.warn(`\n[WARNING] ${missingCount} of 10 target tables are missing from the test database.`);
            console.warn('The harness or setup migrations must be reviewed before test execution.');
        } else {
            console.log('\n[SUCCESS] All 10 target tables exist and are ready for read-only contract verification.');
        }

        console.log('\n=== READ-ONLY SCHEMA INSPECTION COMPLETED SUCCESSFULLY ===');
    } finally {
        await connection.end();
    }
}

inspectSchema().catch(err => {
    console.error('[INSPECTION ERROR]', err.message);
    process.exit(1);
});
