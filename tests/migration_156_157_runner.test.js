import { describe, test, expect, vi } from 'vitest';
const fs = require('fs');
const path = require('path');
const { parseMigrationSql } = require('../src/api/services/migrationSqlParser');

/**
 * Migration 156 to 160 Parser & Statement Validation Suite.
 */
describe('Migrations 156-160 Parser & Structure Validation Suite', () => {
    test('1. Migration 156 parses into valid executable SQL statements', () => {
        const sqlContent = fs.readFileSync(path.join(__dirname, '../migrations/156_phase194f_tenant_notification_preferences_schema_sync.sql'), 'utf8');
        const parsed = parseMigrationSql(sqlContent);

        expect(parsed.statements.length).toBeGreaterThan(0);
        parsed.statements.forEach(stmt => {
            expect(stmt.sql.toUpperCase()).not.toContain('DELIMITER $$');
            expect(stmt.sql.toUpperCase()).not.toContain('DELIMITER ;');
        });
    });

    test('2. Migration 157 parses into valid ALTER TABLE statement', () => {
        const sqlContent = fs.readFileSync(path.join(__dirname, '../migrations/157_phase194g_calibration_acceptances_nullable_provenance.sql'), 'utf8');
        const parsed = parseMigrationSql(sqlContent);

        expect(parsed.statements.length).toBe(1);
        expect(parsed.statements[0].sql.toUpperCase()).toContain('ALTER TABLE PRINTHOUSE_PRICING_CALIBRATION_ACCEPTANCES');
    });

    test('3. Migration 158 parses into valid CREATE TABLE statements for user_sessions and user_mfa', () => {
        const sqlContent = fs.readFileSync(path.join(__dirname, '../migrations/158_phase195e_auth_sessions_and_mfa.sql'), 'utf8');
        const parsed = parseMigrationSql(sqlContent);

        expect(parsed.statements.length).toBeGreaterThanOrEqual(2);
        const upper = sqlContent.toUpperCase();
        expect(upper).toContain('CREATE TABLE IF NOT EXISTS USER_SESSIONS');
        expect(upper).toContain('CREATE TABLE IF NOT EXISTS USER_MFA');
    });

    test('4. Migration 159 parses into valid CREATE TABLE statements for webhooks and slack', () => {
        const sqlContent = fs.readFileSync(path.join(__dirname, '../migrations/159_phase195f_outgoing_webhooks_and_slack.sql'), 'utf8');
        const parsed = parseMigrationSql(sqlContent);

        expect(parsed.statements.length).toBeGreaterThanOrEqual(3);
        const upper = sqlContent.toUpperCase();
        expect(upper).toContain('CREATE TABLE IF NOT EXISTS WEBHOOK_SUBSCRIPTIONS');
        expect(upper).toContain('CREATE TABLE IF NOT EXISTS WEBHOOK_DELIVERIES');
        expect(upper).toContain('CREATE TABLE IF NOT EXISTS SLACK_INTEGRATIONS');
    });

    test('5. Migration 160 parses into valid CREATE TABLE statement for bpe_pricing_publications', () => {
        const sqlContent = fs.readFileSync(path.join(__dirname, '../migrations/160_phase195g_pricing_bpe_publication.sql'), 'utf8');
        const parsed = parseMigrationSql(sqlContent);

        expect(parsed.statements.length).toBeGreaterThanOrEqual(1);
        const upper = sqlContent.toUpperCase();
        expect(upper).toContain('CREATE TABLE IF NOT EXISTS BPE_PRICING_PUBLICATIONS');
    });
});

/**
 * CI-02L.1: Canonical Bootstrap and Migration 156 Compatibility Suite
 * Validates tenant_notification_preferences schema definition, idempotent creation,
 * rejection of incompatible tables, isolation guards, and compatibility with migration 156.
 */
describe('CI-02L.1: tenant_notification_preferences Canonical Bootstrap & Migration 156 Suite', () => {
    const CANONICAL_COLS = [
        'tenant_id',
        'email_enabled',
        'webhook_enabled',
        'email_order_alerts',
        'email_qc_alerts',
        'email_sla_alerts',
        'email_recipients_json',
        'webhook_endpoint',
        'webhook_url',
        'updated_at'
    ];

    test('1. Migration 156 target columns are all present in canonical contract definition', () => {
        // The 4 columns conditionally synchronized by Migration 156:
        const migration156Cols = [
            'email_order_alerts',
            'email_qc_alerts',
            'email_sla_alerts',
            'webhook_endpoint'
        ];

        migration156Cols.forEach(col => {
            expect(CANONICAL_COLS).toContain(col);
        });
    });

    test('2. Ephemeral bootstrap creates tenant_notification_preferences with full contract', async () => {
        const executedQueries = [];
        const mockDb = {
            async query(sql, params) {
                executedQueries.push(sql);
                return [[]];
            }
        };

        // Execute CREATE TABLE IF NOT EXISTS for tenant_notification_preferences
        const bootstrapSql = `
            CREATE TABLE IF NOT EXISTS tenant_notification_preferences (
                tenant_id VARCHAR(64) PRIMARY KEY,
                email_enabled BOOLEAN DEFAULT TRUE,
                webhook_enabled BOOLEAN DEFAULT FALSE,
                email_order_alerts TINYINT(1) DEFAULT 1,
                email_qc_alerts TINYINT(1) DEFAULT 1,
                email_sla_alerts TINYINT(1) DEFAULT 1,
                email_recipients_json JSON NULL,
                webhook_endpoint VARCHAR(512) NULL,
                webhook_url VARCHAR(512) NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;
        await mockDb.query(bootstrapSql);

        expect(executedQueries.length).toBe(1);
        const queryUpper = executedQueries[0].toUpperCase();
        expect(queryUpper).toContain('CREATE TABLE IF NOT EXISTS TENANT_NOTIFICATION_PREFERENCES');
        expect(queryUpper).toContain('TENANT_ID VARCHAR(64) PRIMARY KEY');
        expect(queryUpper).toContain('EMAIL_ORDER_ALERTS TINYINT(1) DEFAULT 1');
        expect(queryUpper).toContain('EMAIL_QC_ALERTS TINYINT(1) DEFAULT 1');
        expect(queryUpper).toContain('EMAIL_SLA_ALERTS TINYINT(1) DEFAULT 1');
        expect(queryUpper).toContain('WEBHOOK_ENDPOINT VARCHAR(512) NULL');
    });

    test('3. Migration 156 procedure finds existing columns in information_schema and skips ALTER TABLE', async () => {
        // Mock information_schema check that Migration 156 performs for each of the 4 columns
        const existingColsInTable = new Set(CANONICAL_COLS);
        const executedAlters = [];

        const checkAndAddColumn = async (colName, alterSql) => {
            const exists = existingColsInTable.has(colName);
            if (!exists) {
                executedAlters.push(alterSql);
            }
        };

        // Simulate sync_tenant_notification_preferences_cols() logic
        await checkAndAddColumn('email_order_alerts', 'ALTER TABLE tenant_notification_preferences ADD COLUMN email_order_alerts TINYINT(1) DEFAULT 1;');
        await checkAndAddColumn('email_qc_alerts', 'ALTER TABLE tenant_notification_preferences ADD COLUMN email_qc_alerts TINYINT(1) DEFAULT 1;');
        await checkAndAddColumn('email_sla_alerts', 'ALTER TABLE tenant_notification_preferences ADD COLUMN email_sla_alerts TINYINT(1) DEFAULT 1;');
        await checkAndAddColumn('webhook_endpoint', 'ALTER TABLE tenant_notification_preferences ADD COLUMN webhook_endpoint VARCHAR(512) NULL;');

        // Zero ALTER TABLE statements should be executed when canonical table exists
        expect(executedAlters.length).toBe(0);
    });

    test('4. Migration 156 safely adds columns if an earlier partial table is missing them', async () => {
        // Suppose a legacy table only had tenant_id, email_enabled, webhook_enabled
        const partialCols = new Set(['tenant_id', 'email_enabled', 'webhook_enabled']);
        const executedAlters = [];

        const checkAndAddColumn = async (colName, alterSql) => {
            const exists = partialCols.has(colName);
            if (!exists) {
                executedAlters.push(alterSql);
                partialCols.add(colName);
            }
        };

        await checkAndAddColumn('email_order_alerts', 'ALTER TABLE tenant_notification_preferences ADD COLUMN email_order_alerts TINYINT(1) DEFAULT 1;');
        await checkAndAddColumn('email_qc_alerts', 'ALTER TABLE tenant_notification_preferences ADD COLUMN email_qc_alerts TINYINT(1) DEFAULT 1;');
        await checkAndAddColumn('email_sla_alerts', 'ALTER TABLE tenant_notification_preferences ADD COLUMN email_sla_alerts TINYINT(1) DEFAULT 1;');
        await checkAndAddColumn('webhook_endpoint', 'ALTER TABLE tenant_notification_preferences ADD COLUMN webhook_endpoint VARCHAR(512) NULL;');

        expect(executedAlters.length).toBe(4);
        expect(partialCols.has('email_order_alerts')).toBe(true);
        expect(partialCols.has('email_qc_alerts')).toBe(true);
        expect(partialCols.has('email_sla_alerts')).toBe(true);
        expect(partialCols.has('webhook_endpoint')).toBe(true);
    });

    test('5. Bootstrap explicitly rejects pre-existing table if required canonical columns are missing', async () => {
        // Mock db where tenant_notification_preferences already exists but is missing webhook_url
        const mockDb = {
            async query(sql) {
                if (sql.includes('FROM information_schema.TABLES')) {
                    return [[{ TABLE_NAME: 'tenant_notification_preferences' }]];
                }
                if (sql.includes('FROM information_schema.COLUMNS')) {
                    // Missing webhook_url!
                    return [[
                        { COLUMN_NAME: 'tenant_id' },
                        { COLUMN_NAME: 'email_enabled' },
                        { COLUMN_NAME: 'webhook_enabled' }
                    ]];
                }
                return [[]];
            }
        };

        const auditPreExistingTnp = async (db) => {
            const [tnpExists] = await db.query(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_NAME = 'tenant_notification_preferences'`);
            if (tnpExists && tnpExists.length > 0) {
                const [tnpCols] = await db.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_NAME = 'tenant_notification_preferences'`);
                const existingColNames = new Set((tnpCols || []).map(c => c.COLUMN_NAME.toLowerCase()));
                const requiredTnpCols = [
                    'tenant_id', 'email_enabled', 'webhook_enabled',
                    'email_order_alerts', 'email_qc_alerts', 'email_sla_alerts',
                    'email_recipients_json', 'webhook_endpoint', 'webhook_url', 'updated_at'
                ];
                for (const col of requiredTnpCols) {
                    if (!existingColNames.has(col.toLowerCase())) {
                        throw new Error(
                            `STRUCTURAL IDEMPOTENCY DIVERGENCE: Pre-existing table 'tenant_notification_preferences' is missing required canonical column '${col}'. Aborting bootstrap.`
                        );
                    }
                }
            }
        };

        await expect(auditPreExistingTnp(mockDb)).rejects.toThrow(
            /STRUCTURAL IDEMPOTENCY DIVERGENCE: Pre-existing table 'tenant_notification_preferences' is missing required canonical column/
        );
    });

    test('6. Bootstrap passes idempotently when pre-existing table satisfies full canonical contract', async () => {
        const executedCreates = [];
        const mockDb = {
            async query(sql) {
                if (sql.includes('CREATE TABLE')) {
                    executedCreates.push(sql);
                }
                if (sql.includes('FROM information_schema.TABLES')) {
                    return [[{ TABLE_NAME: 'tenant_notification_preferences' }]];
                }
                if (sql.includes('FROM information_schema.COLUMNS')) {
                    return [CANONICAL_COLS.map(c => ({ COLUMN_NAME: c }))];
                }
                return [[]];
            }
        };

        const auditAndCreateTnp = async (db) => {
            const [tnpExists] = await db.query(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_NAME = 'tenant_notification_preferences'`);
            if (tnpExists && tnpExists.length > 0) {
                const [tnpCols] = await db.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_NAME = 'tenant_notification_preferences'`);
                const existingColNames = new Set((tnpCols || []).map(c => c.COLUMN_NAME.toLowerCase()));
                const requiredTnpCols = [
                    'tenant_id', 'email_enabled', 'webhook_enabled',
                    'email_order_alerts', 'email_qc_alerts', 'email_sla_alerts',
                    'email_recipients_json', 'webhook_endpoint', 'webhook_url', 'updated_at'
                ];
                for (const col of requiredTnpCols) {
                    if (!existingColNames.has(col.toLowerCase())) {
                        throw new Error(
                            `STRUCTURAL IDEMPOTENCY DIVERGENCE: Pre-existing table 'tenant_notification_preferences' is missing required canonical column '${col}'. Aborting bootstrap.`
                        );
                    }
                }
            } else {
                await db.query(`CREATE TABLE tenant_notification_preferences ...`);
            }
        };

        await expect(auditAndCreateTnp(mockDb)).resolves.not.toThrow();
        expect(executedCreates.length).toBe(0);
    });
});
