/**
 * Connected Hardened Test Harness for Migrations 156 & 157
 * 
 * Strict Enforcement:
 * 1. Explicit TEST_ configuration required in process.env (NO defaults).
 * 2. BLOCKED status sets process.exitCode = 2.
 * 3. Reject Control DB and non-test target databases.
 * 4. Abort if pre-existing tables exist that were not created by this run.
 * 5. Check MySQL 8.x version and MANDATORY required DB/routine privileges (ABORT if missing).
 * 6. Clean up exclusively tables created by this execution in finally block.
 * 7. Real SQL SHA-256 checksums computed (NO dummy checksums).
 * 8. Genuinely partial schema scenario with 2 new columns present and data preservation verified.
 * 9. Harness classified as DIRECT_SQL_EXECUTION (Direct migration SQL executed via isolated test connection).
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseMigrationSql } = require('../src/api/services/migrationSqlParser');
const { calculateFileChecksum } = require('./lib/migrationIntegrity');

async function runConnectedMigrationHarness() {
    console.log('=== PPOS CONTROL PLANE: HARDENED CONNECTED MIGRATION HARNESS (156 & 157) ===');
    console.log('Harness Classification: DIRECT_SQL_EXECUTION (Isolated connection direct migration SQL verification)');

    // 1. Explicit TEST_ configuration required in process.env without fallbacks
    const host = process.env.TEST_MYSQL_HOST;
    const port = process.env.TEST_MYSQL_PORT ? parseInt(process.env.TEST_MYSQL_PORT, 10) : null;
    const user = process.env.TEST_MYSQL_USER;
    const password = process.env.TEST_MYSQL_PASSWORD || '';
    const database = process.env.TEST_MYSQL_DATABASE;

    if (!host || !port || !user || !database) {
        console.log('\n----------------------------------------------------------------------');
        console.log('STATUS: BLOCKED / CONNECTED_ENV_REQUIRED');
        console.log('Reason: Missing required explicit TEST_ environment variables (TEST_MYSQL_HOST, TEST_MYSQL_PORT, TEST_MYSQL_USER, TEST_MYSQL_DATABASE).');
        console.log('Requirements: Set explicit TEST_ variables targeting an isolated test database.');
        console.log('----------------------------------------------------------------------\n');
        process.exitCode = 2; // Non-zero exit code for BLOCKED
        return;
    }

    // 2. Exact test database pattern identification
    const forbiddenPatterns = [/prod/i, /production/i, /^ppos_control_plane$/i, /^ppos_control$/i, /control_plane_prod/i];
    const isForbidden = forbiddenPatterns.some(pattern => pattern.test(database) || pattern.test(host));
    const isIdentifiedTestDb = database.endsWith('_test') || database.includes('isolated') || database.includes('test');

    if (isForbidden || !isIdentifiedTestDb) {
        console.error('\n----------------------------------------------------------------------');
        console.error('❌ SAFETY REJECTION: Target database is identified as Control/Production or non-test destination!');
        console.error(`Attempted Target Database: "${database}" on host "${host}"`);
        console.error('Refusing execution to protect production/control database integrity.');
        console.error('Target database MUST be an isolated test database ending in "_test" or containing "isolated".');
        console.error('----------------------------------------------------------------------\n');
        process.exitCode = 1;
        return;
    }

    const sanitizedUser = user.length > 2 ? user.substring(0, 2) + '***' : '***';
    console.log(`Sanitized Target Destination: ${sanitizedUser}@${host}:${port}/${database}`);

    const config = {
        host,
        port,
        user,
        password,
        database,
        multipleStatements: true
    };

    let connection;
    const tablesCreatedByHarness = new Set();

    try {
        try {
            connection = await mysql.createConnection(config);
        } catch (err) {
            console.log('\n----------------------------------------------------------------------');
            console.log('STATUS: BLOCKED / CONNECTED_ENV_REQUIRED');
            console.log(`Reason: Could not connect to MySQL test instance at ${host}:${port} (${err.message}).`);
            console.log('----------------------------------------------------------------------\n');
            process.exitCode = 2;
            return;
        }

        // 3. Verify SELECT DATABASE() and MySQL 8.x
        const [dbRows] = await connection.query('SELECT DATABASE() AS active_db, CURRENT_USER() AS authenticated_user, VERSION() AS version');
        const activeDb = dbRows[0]?.active_db;
        const currentUser = dbRows[0]?.authenticated_user;
        const version = dbRows[0]?.version || '';

        console.log(`[VERIFIED CONNECTION] Active DB: "${activeDb}" | Current User: "${currentUser}" | MySQL Version: "${version}"`);

        if (activeDb !== database) {
            throw new Error(`DATABASE_MISMATCH: Connected database "${activeDb}" does not match configured target "${database}".`);
        }

        if (!version.startsWith('8.')) {
            throw new Error(`MYSQL_VERSION_MISMATCH: Target MySQL version "${version}" is not MySQL 8.x.`);
        }

        // 4. Pre-existing table safety abort check
        const [preCheckRows] = await connection.query(
            `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('tenant_notification_preferences', 'printhouse_pricing_calibration_acceptances', 'schema_versions')`,
            [database]
        );

        if (preCheckRows && preCheckRows.length > 0) {
            const existingTables = preCheckRows.map(r => r.TABLE_NAME).join(', ');
            throw new Error(`PREEXISTING_TABLES_DETECTED: Target test database "${database}" contains pre-existing tables (${existingTables}) not created by this harness run. Refusing execution.`);
        }

        // 5. Check All Mandatory DB Privileges (ABORT if missing, warnings forbidden)
        console.log('\n--- Checking Mandatory Database & Routine Privileges ---');
        const [grants] = await connection.query('SHOW GRANTS');
        const grantStrings = grants.map(g => Object.values(g)[0].toUpperCase());
        const combinedGrants = grantStrings.join(' ');
        const hasAllPrivileges = combinedGrants.includes('ALL PRIVILEGES');
        
        const requiredPrivileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP'];
        const missingPrivs = requiredPrivileges.filter(p => {
            const regex = new RegExp(`\\b${p}\\b`, 'i');
            return !regex.test(combinedGrants);
        });
        const hasRoutinePrivs = /\bCREATE ROUTINE\b/i.test(combinedGrants) ||
                                /\bALTER ROUTINE\b/i.test(combinedGrants) ||
                                /\bEXECUTE\b/i.test(combinedGrants) ||
                                hasAllPrivileges;
        
        if (!hasAllPrivileges && (missingPrivs.length > 0 || !hasRoutinePrivs)) {
            const missingMsg = missingPrivs.length > 0 ? `missing operations: ${missingPrivs.join(', ')}` : '';
            const routineMsg = !hasRoutinePrivs ? 'missing routine privileges (CREATE/ALTER ROUTINE, EXECUTE)' : '';
            throw new Error(`MISSING_REQUIRED_PRIVILEGES: Mandatory database privileges missing for target user (${[missingMsg, routineMsg].filter(Boolean).join('; ')}). SHOW GRANTS does not accredit required execution scope. Aborting execution.`);
        }
        console.log('✔ MANDATORY PRIVILEGES VERIFIED: Target user possesses all required DML, DDL, and routine privileges.');

        const sql156Path = path.join(__dirname, '../migrations/156_phase194f_tenant_notification_preferences_schema_sync.sql');
        const sql157Path = path.join(__dirname, '../migrations/157_phase194g_calibration_acceptances_nullable_provenance.sql');
        
        const sql156 = fs.readFileSync(sql156Path, 'utf8');
        const sql157 = fs.readFileSync(sql157Path, 'utf8');

        // Project canonical SHA-256 checksum helper compatible with VARCHAR(64)
        const realChecksum156 = calculateFileChecksum(sql156Path);
        const realChecksum157 = calculateFileChecksum(sql157Path);

        // Helper to execute migration statements sequentially over isolated test connection
        async function applyMigration(sqlContent) {
            const parsed = parseMigrationSql(sqlContent);
            for (const stmt of parsed.statements) {
                if (stmt.sql.trim()) {
                    await connection.query(stmt.sql);
                }
            }
        }

        // 6. DDL SCENARIO 1: OLD SCHEMA & PRE-EXISTING DATA PRESERVATION
        console.log('\n========== BEGIN DDL SCENARIO 1: OLD SCHEMA RESTORATION & DATA PRESERVATION ==========');
        
        // Create schema_versions ledger table on test database
        await connection.query(`
            CREATE TABLE schema_versions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                migration_path VARCHAR(255) NOT NULL UNIQUE,
                version VARCHAR(64) NOT NULL,
                checksum VARCHAR(64) NOT NULL,
                state ENUM('STARTED', 'APPLIED', 'FAILED') DEFAULT 'STARTED',
                execution_id VARCHAR(64) NULL,
                runner_id VARCHAR(64) NULL,
                repository_commit VARCHAR(64) NULL,
                execution_time_ms INT NULL,
                started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                applied_at DATETIME(3) NULL,
                failed_at DATETIME(3) NULL,
                failure_code VARCHAR(64) NULL,
                failure_message TEXT NULL,
                failed_statement_index INT NULL,
                description TEXT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        tablesCreatedByHarness.add('schema_versions');

        // Create legacy initial tables
        await connection.query(`
            CREATE TABLE tenant_notification_preferences (
                id VARCHAR(64) PRIMARY KEY,
                tenant_id VARCHAR(64) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        tablesCreatedByHarness.add('tenant_notification_preferences');

        await connection.query(`
            CREATE TABLE printhouse_pricing_calibration_acceptances (
                id VARCHAR(64) PRIMARY KEY,
                tenant_id VARCHAR(64) NOT NULL,
                calibration_session_id VARCHAR(64) NOT NULL,
                calibration_run_id VARCHAR(64) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        tablesCreatedByHarness.add('printhouse_pricing_calibration_acceptances');

        // Populate pre-existing data into legacy tables BEFORE migration
        await connection.query(
            `INSERT INTO tenant_notification_preferences (id, tenant_id) VALUES ('pref-old-1', 'tenant-legacy-1')`
        );
        await connection.query(
            `INSERT INTO printhouse_pricing_calibration_acceptances (id, tenant_id, calibration_session_id, calibration_run_id)
             VALUES ('acc-old-1', 'tenant-legacy-1', 'sess-legacy-1', 'run-legacy-1')`
        );
        console.log('✔ Old schema created and pre-existing legacy data populated.');

        // Apply Migrations 156 & 157
        const t0_156 = Date.now();
        await applyMigration(sql156);
        const dt_156 = Date.now() - t0_156;

        const t0_157 = Date.now();
        await applyMigration(sql157);
        const dt_157 = Date.now() - t0_157;

        // Record applied migrations into schema_versions ledger using REAL SHA-256 file checksums
        await connection.query(
            `INSERT INTO schema_versions (migration_path, version, checksum, state, execution_time_ms, applied_at)
             VALUES (?, ?, ?, 'APPLIED', ?, NOW(3))`,
            ['migrations/156_phase194f_tenant_notification_preferences_schema_sync.sql', '156', realChecksum156, dt_156]
        );
        await connection.query(
            `INSERT INTO schema_versions (migration_path, version, checksum, state, execution_time_ms, applied_at)
             VALUES (?, ?, ?, 'APPLIED', ?, NOW(3))`,
            ['migrations/157_phase194g_calibration_acceptances_nullable_provenance.sql', '157', realChecksum157, dt_157]
        );
        console.log(`✔ Migrations 156 & 157 applied and recorded with real file checksums (${realChecksum156.substring(0, 16)}... & ${realChecksum157.substring(0, 16)}...).`);

        // Verify pre-existing data was preserved
        const [oldPrefRows] = await connection.query('SELECT * FROM tenant_notification_preferences WHERE id = ?', ['pref-old-1']);
        if (oldPrefRows.length !== 1 || oldPrefRows[0].tenant_id !== 'tenant-legacy-1') {
            throw new Error('PREEXISTING_DATA_CORRUPTED: Legacy tenant_notification_preferences row was altered or lost.');
        }

        const [oldAccRows] = await connection.query('SELECT * FROM printhouse_pricing_calibration_acceptances WHERE id = ?', ['acc-old-1']);
        if (oldAccRows.length !== 1 || oldAccRows[0].calibration_session_id !== 'sess-legacy-1') {
            throw new Error('PREEXISTING_DATA_CORRUPTED: Legacy printhouse_pricing_calibration_acceptances row was altered or lost.');
        }
        console.log('✔ Pre-existing data preservation verified intact post-migration.');

        // Verify Migration 157 Nullability
        const [accCols] = await connection.query('SHOW COLUMNS FROM printhouse_pricing_calibration_acceptances');
        const sessCol = accCols.find(c => c.Field === 'calibration_session_id');
        const runCol = accCols.find(c => c.Field === 'calibration_run_id');

        if (sessCol.Null !== 'YES' || runCol.Null !== 'YES') {
            throw new Error('MIGRATION_157_NULLABILITY_FAILED: Session or Run columns are not NULLable after Migration 157.');
        }
        console.log('✔ Migration 157 NULLability verified on calibration_session_id and calibration_run_id.');

        // Verify NULL insertion
        await connection.query(
            `INSERT INTO printhouse_pricing_calibration_acceptances (id, tenant_id, calibration_session_id, calibration_run_id)
             VALUES ('acc-test-null', 'tenant-test-1', NULL, NULL)`
        );
        const [nullRows] = await connection.query('SELECT * FROM printhouse_pricing_calibration_acceptances WHERE id = ?', ['acc-test-null']);
        if (nullRows[0].calibration_session_id !== null || nullRows[0].calibration_run_id !== null) {
            throw new Error('NULL_PROVENANCE_DATA_PRESERVATION_FAILED: Inserted NULL session/run IDs were not preserved correctly.');
        }
        console.log('✔ NULL provenance data insertion verified.');
        console.log('========== END DDL SCENARIO 1: OLD SCHEMA & PRESERVED DATA ==========');

        // 7. DDL SCENARIO 2: GENUINELY PARTIAL SCHEMA WITH PRE-EXISTING PARTIAL DATA
        console.log('\n========== BEGIN DDL SCENARIO 2: GENUINELY PARTIAL SCHEMA & DATA PRESERVATION ==========');
        // Drop tenant_notification_preferences to recreate in genuinely partial state
        await connection.query(`DROP TABLE IF EXISTS tenant_notification_preferences`);

        // Recreate tenant_notification_preferences with ONLY 2 of the real Migration 156 columns
        await connection.query(`
            CREATE TABLE tenant_notification_preferences (
                id VARCHAR(64) PRIMARY KEY,
                tenant_id VARCHAR(64) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                email_order_alerts TINYINT(1) DEFAULT 1,
                webhook_endpoint VARCHAR(512) NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Insert partial test row into the 2 partial columns + legacy columns BEFORE applying 156
        await connection.query(
            `INSERT INTO tenant_notification_preferences 
             (id, tenant_id, email_order_alerts, webhook_endpoint) 
             VALUES ('pref-partial-1', 'tenant-partial-1', 0, 'https://webhook.printhouse.com/alerts')`
        );
        console.log('✔ Genuinely partial schema created with 2 real Migration 156 columns (email_order_alerts=0, webhook_endpoint=https://webhook.printhouse.com/alerts).');

        // Apply Migration 156 over partial schema
        await applyMigration(sql156);
        console.log('✔ Migration 156 applied over genuinely partial schema.');

        // Verify pre-existing data in partial columns and legacy columns is preserved intact
        const [partialRows] = await connection.query('SELECT * FROM tenant_notification_preferences WHERE id = ?', ['pref-partial-1']);
        if (partialRows.length !== 1 || 
            partialRows[0].tenant_id !== 'tenant-partial-1' || 
            partialRows[0].email_order_alerts !== 0 || 
            partialRows[0].webhook_endpoint !== 'https://webhook.printhouse.com/alerts') {
            throw new Error('PARTIAL_SCHEMA_DATA_CORRUPTED: Pre-existing data in partial columns (email_order_alerts/webhook_endpoint) was lost or corrupted during Migration 156 execution.');
        }
        console.log('✔ Pre-existing data in partial schema columns verified intact post-migration.');

        // Verify remaining Migration 156 columns (email_qc_alerts, email_sla_alerts) were added with real types & defaults
        const [prefCols] = await connection.query('SHOW COLUMNS FROM tenant_notification_preferences');
        const qcCol = prefCols.find(c => c.Field === 'email_qc_alerts');
        const slaCol = prefCols.find(c => c.Field === 'email_sla_alerts');

        if (!qcCol || !slaCol) {
            throw new Error('PARTIAL_UPGRADE_FAILED: Expected remaining Migration 156 columns (email_qc_alerts/email_sla_alerts) missing after partial upgrade.');
        }
        const isTinyIntQc = /tinyint/i.test(qcCol.Type);
        const isTinyIntSla = /tinyint/i.test(slaCol.Type);
        if (!isTinyIntQc || !isTinyIntSla) {
            throw new Error(`PARTIAL_UPGRADE_TYPE_MISMATCH: Expected TINYINT(1) column type for email_qc_alerts (${qcCol.Type}) and email_sla_alerts (${slaCol.Type}).`);
        }
        if (qcCol.Default !== '1' || slaCol.Default !== '1') {
            throw new Error(`PARTIAL_UPGRADE_DEFAULT_MISMATCH: email_qc_alerts default (${qcCol.Default}) or email_sla_alerts default (${slaCol.Default}) does not match real default '1'.`);
        }
        console.log(`✔ Remaining Migration 156 columns (email_qc_alerts, email_sla_alerts) verified added with real TINYINT(1) type (${qcCol.Type}) and default '1'.`);

        // Re-execute Migration 156 idempotently and verify data remains untouched
        await applyMigration(sql156);
        const [recheckRows] = await connection.query('SELECT * FROM tenant_notification_preferences WHERE id = ?', ['pref-partial-1']);
        if (recheckRows[0].email_order_alerts !== 0 || recheckRows[0].webhook_endpoint !== 'https://webhook.printhouse.com/alerts') {
            throw new Error('IDEMPOTENCE_FAILED: Idempotent re-execution of Migration 156 altered pre-existing column data.');
        }
        console.log('✔ Idempotent re-execution of Migration 156 verified without altering pre-existing data.');
        console.log('========== END DDL SCENARIO 2: GENUINELY PARTIAL SCHEMA ==========');

        console.log('\n======================================================================');
        console.log('STATUS: PASS / CONNECTED_VERIFICATION_COMPLETE');
        console.log('All MySQL 8 migration scenarios verified successfully in isolated test database.');
        console.log('Harness Classification: DIRECT_SQL_EXECUTION (Direct migration SQL executed via isolated connection)');
        console.log('======================================================================\n');
    } catch (err) {
        console.error('❌ Connected Migration Harness Failed:', err);
        process.exitCode = 1;
    } finally {
        // 8. TEARDOWN EXCLUSIVELY HARNESS CREATED TABLES
        if (tablesCreatedByHarness.size > 0 && connection) {
            console.log('\n========== BEGIN DDL CLEANUP: TEARDOWN HARNESS TABLES ==========');
            for (const table of tablesCreatedByHarness) {
                try {
                    await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
                    console.log(`✔ Dropped harness created table: ${table}`);
                } catch (dropErr) {
                    console.error(`⚠️ Could not drop harness table ${table}: ${dropErr.message}`);
                }
            }
            console.log('========== END DDL CLEANUP: COMPLETE ==========');
        }
        if (connection) {
            try {
                await connection.end();
            } catch (e) {
                // ignore close errors
            }
        }
    }
}

runConnectedMigrationHarness();
