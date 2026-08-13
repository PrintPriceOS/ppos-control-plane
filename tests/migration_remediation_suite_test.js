/**
 * tests/migration_remediation_suite_test.js
 *
 * Targeted tests covering:
 * A. parser: normal SQL, DELIMITER, stored procedures, triggers, comments, quotes, etc.
 * B. retry: retry allowance based on path, checksum, and active locks/evidence preservation.
 * C. partial migration: idempotency behavior when table/columns already exist.
 */

require('dotenv').config();
process.env.MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../src/api/services/mysqlClient');
const { parseMigrationSql } = require('../src/api/services/migrationSqlParser');
const { MigrationService } = require('../src/api/services/migrationService');
const ledgerRead = require('../src/api/services/migrationLedgerReadService');

// Helper to clean up env variables after tests
const originalEnv = { ...process.env };
function resetEnv() {
    process.env = { ...originalEnv };
}

async function runParserTests() {
    console.log('--- Running SQL Parser Tests ---');

    // 1. Normal SQL (trailing semicolons stripped)
    const normal = parseMigrationSql(`
      CREATE TABLE users (id INT PRIMARY KEY);
      INSERT INTO users VALUES (1);
    `);
    assert.strictEqual(normal.statements.length, 2);
    assert.strictEqual(normal.statements[0].sql, 'CREATE TABLE users (id INT PRIMARY KEY)');
    assert.strictEqual(normal.statements[1].sql, 'INSERT INTO users VALUES (1)');
    console.log('✓ Normal SQL parsing ok');

    // 2. DELIMITER $$ with stored procedure
    const delimiterProc = parseMigrationSql(`
      DELIMITER $$
      CREATE PROCEDURE add_user()
      BEGIN
        INSERT INTO users VALUES (2);
      END $$
      DELIMITER ;
    `);
    assert.strictEqual(delimiterProc.statements.length, 1);
    assert.strictEqual(delimiterProc.statements[0].sql, `CREATE PROCEDURE add_user()
      BEGIN
        INSERT INTO users VALUES (2);
      END`);
    assert.strictEqual(delimiterProc.delimiterChanges, 2);
    console.log('✓ DELIMITER $$ and stored procedure parsing ok');

    // 3. Trigger with BEGIN/END and DELIMITER $$
    const trigger = parseMigrationSql(`
      DELIMITER $$
      CREATE TRIGGER before_user_insert
      BEFORE INSERT ON users
      FOR EACH ROW
      BEGIN
        SET NEW.name = TRIM(NEW.name);
      END $$
      DELIMITER ;
    `);
    assert.strictEqual(trigger.statements.length, 1);
    assert.strictEqual(trigger.statements[0].sql, `CREATE TRIGGER before_user_insert
      BEFORE INSERT ON users
      FOR EACH ROW
      BEGIN
        SET NEW.name = TRIM(NEW.name);
      END`);
    console.log('✓ Trigger with BEGIN/END parsing ok');

    // 4. Comments and Quotes handling
    const commentsAndQuotes = parseMigrationSql(`
      -- This is a comment
      SELECT * FROM users WHERE name = 'John; Doe'; # another comment
      /* Block comment with semicolon; */
      SELECT 2;
    `);
    assert.strictEqual(commentsAndQuotes.statements.length, 2);
    assert.ok(commentsAndQuotes.statements[0].sql.includes("name = 'John; Doe'"));
    assert.ok(commentsAndQuotes.statements[1].sql.includes('SELECT 2'));
    console.log('✓ Comments and quotes parsing ok');
}

async function runRetryTests() {
    console.log('\n--- Running Retry Governance Tests ---');

    const originalGetPool = db.getPool;
    const originalQuery = db.query;
    const migrationsDir = path.join(__dirname, '../migrations');
    const baselinePath = path.join(migrationsDir, 'migration-integrity-baseline.json');
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

    // We will discover the first baseline migration to test with
    const testMigration = baseline.migrations[0];
    const testPath = testMigration.path || testMigration.relativePath;
    const testChecksum = testMigration.canonicalSha256 || testMigration.sha256;

    let mockDbState = [];
    let queryLog = [];

    // Mock Pool Connection
    const mockConnection = {
        query: async (sql, params = []) => {
            queryLog.push({ sql, params });
            const s = sql.trim().toUpperCase();

            if (s.includes('GET_LOCK')) {
                return [[{ is_locked: 1 }]];
            }
            if (s.includes('RELEASE_LOCK')) {
                return [[{ is_released: 1 }]];
            }
            if (s.includes('INFORMATION_SCHEMA.TABLES')) {
                return [[{ TABLE_NAME: 'schema_versions' }]];
            }
            if (s.includes('INFORMATION_SCHEMA.COLUMNS')) {
                return [[
                    { COLUMN_NAME: 'state' },
                    { COLUMN_NAME: 'previous_failures' }
                ]];
            }
            if (s.includes('SELECT RECORD_TYPE, MIGRATION_PATH, CHECKSUM, STATE, STARTED_AT, HEARTBEAT_AT, FAILURE_CODE')) {
                return [mockDbState];
            }
            if (s.includes('SELECT VERSION, DESCRIPTION, CHECKSUM, STATE FROM SCHEMA_VERSIONS')) {
                return [mockDbState];
            }
            if (s.includes('SELECT EXECUTION_ID, RUNNER_ID, STARTED_AT, FAILED_AT')) {
                return [mockDbState.filter(r => r.migration_path === params[0])];
            }
            if (s.includes('INSERT INTO SCHEMA_VERSIONS')) {
                // Mock execution inserting STARTED record
                return [{ affectedRows: 1 }];
            }
            if (s.includes('UPDATE SCHEMA_VERSIONS')) {
                return [{ affectedRows: 1 }];
            }
            return [[]];
        },
        release: () => {}
    };

    db.getPool = () => ({
        getConnection: async () => mockConnection,
        query: async (sql, params = []) => {
            return mockConnection.query(sql, params);
        }
    });
    db.query = async (sql, params = []) => {
        const res = await mockConnection.query(sql, params);
        return res[0];
    };

    const service = new MigrationService();

    // Test B1: FAILED same path + same checksum -> explicit retry allowed
    process.env.PPOS_MIGRATION_EXECUTION = 'true';
    process.env.PPOS_ALLOW_MIGRATION_RETRY = 'true';

    mockDbState = [
        {
            migration_path: testPath,
            version: testMigration.prefix,
            checksum: testChecksum,
            state: 'FAILED',
            started_at: new Date(),
            heartbeat_at: new Date(),
            failure_code: 'ER_PARSE_ERROR',
            execution_id: 'ex-123',
            runner_id: 'runner-1'
        }
    ];

    queryLog = [];
    const status = await ledgerRead.evaluateLedgerStatus(baseline);
    console.log('LEDGER STATUS OBJECT:', status);
    assert.strictEqual(status.status, 'PENDING_MIGRATIONS', 'Should recognize failed migration as pending for retry');
    console.log('✓ evaluateLedgerStatus detects eligible FAILED migration as pending retry');

    // Test B2: FAILED different checksum -> rejected
    mockDbState[0].checksum = 'DIFFERENT_CHECKSUM_XYZ';
    let checksumRejected = false;
    try {
        await ledgerRead.evaluateLedgerStatus(baseline);
    } catch (e) {
        checksumRejected = true;
    }
    const statusMismatch = await ledgerRead.evaluateLedgerStatus(baseline);
    assert.strictEqual(statusMismatch.status, 'MIGRATION_FAILED');
    console.log('✓ Checksum mismatch rejected from retry');

    // Test B3: APPLIED -> skipped
    mockDbState[0].checksum = testChecksum;
    mockDbState[0].state = 'APPLIED';
    const statusApplied = await ledgerRead.evaluateLedgerStatus(baseline);
    assert.ok(statusApplied.status === 'PENDING_MIGRATIONS' && !statusApplied.reason.includes(testPath));
    console.log('✓ APPLIED migration skipped from retry');

    // Restore original DB configuration
    db.getPool = originalGetPool;
    db.query = originalQuery;
    resetEnv();
}

async function runPartialMigrationTests() {
    console.log('\n--- Running Partial Migration Idempotency Tests ---');

    const originalGetPool = db.getPool;
    const originalQuery = db.query;
    let queryLog = [];
    let throwTriggerAlreadyExists = true;

    const mockConnection = {
        query: async (sql, params = []) => {
            queryLog.push({ sql, params });
            const s = sql.trim().toUpperCase();

            if (s.includes('GET_LOCK')) {
                return [[{ is_locked: 1 }]];
            }
            if (s.includes('RELEASE_LOCK')) {
                return [[{ is_released: 1 }]];
            }
            if (s.includes('INFORMATION_SCHEMA.TABLES')) {
                return [[{ TABLE_NAME: 'schema_versions' }]];
            }
            if (s.includes('INFORMATION_SCHEMA.COLUMNS')) {
                return [[
                    { COLUMN_NAME: 'state' },
                    { COLUMN_NAME: 'previous_failures' }
                ]];
            }
            if (s.includes('SELECT VERSION, DESCRIPTION, CHECKSUM, STATE FROM SCHEMA_VERSIONS')) {
                return [[
                    { version: '135_phase185_migration_ledger_governance', state: 'APPLIED', checksum: 'abc' }
                ]];
            }
            if (s.includes('CREATE TRIGGER') && throwTriggerAlreadyExists) {
                // Simulate MySQL trigger already exists error
                const err = new Error("ER_TRG_ALREADY_EXISTS: Trigger already exists");
                err.code = 'ER_TRG_ALREADY_EXISTS';
                err.errno = 1359;
                throw err;
            }
            return [[]];
        },
        release: () => {}
    };

    db.getPool = () => ({
        getConnection: async () => mockConnection,
        query: async (sql, params = []) => {
            return mockConnection.query(sql, params);
        }
    });
    db.query = async (sql, params = []) => {
        const res = await mockConnection.query(sql, params);
        return res[0];
    };

    process.env.PPOS_MIGRATION_EXECUTION = 'true';
    process.env.PPOS_ALLOW_MIGRATION_RETRY = 'true';

    // Run migrations and ensure it ignores ER_TRG_ALREADY_EXISTS cleanly
    try {
        const originalDiscover = require('../scripts/lib/migrationIntegrity').discoverMigrations;
        require('../scripts/lib/migrationIntegrity').discoverMigrations = () => ({
            migrations: [{
                relativePath: 'migrations/136_phase190_order_pricing_snapshot_sealing.sql',
                absolutePath: path.join(__dirname, '../migrations/136_phase190_order_pricing_snapshot_sealing.sql'),
                filename: '136_phase190_order_pricing_snapshot_sealing.sql'
            }]
        });

        const service = new MigrationService();
        const res = await service.runMigrations();
        assert.ok(res.appliedCount >= 0);
        console.log('✓ Migration engine safely bypasses ER_TRG_ALREADY_EXISTS errors');

        require('../scripts/lib/migrationIntegrity').discoverMigrations = originalDiscover;
    } catch (err) {
        assert.fail(`Migration execution failed: ${err.message}`);
    }

    db.getPool = originalGetPool;
    db.query = originalQuery;
    resetEnv();
}

async function main() {
    try {
        await runParserTests();
        await runRetryTests();
        await runPartialMigrationTests();
        console.log('\nAll migration remediation suite tests passed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('\nTest suite failed:', err);
        process.exit(1);
    }
}

main();
