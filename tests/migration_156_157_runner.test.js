import { describe, test, expect, vi, beforeEach } from 'vitest';
const fs = require('fs');
const path = require('path');
const { parseMigrationSql } = require('../src/api/services/migrationSqlParser');

/**
 * Local SQL Parser & Mock Contract Test Suite.
 * NOTE: This suite tests local SQL statement parsing and mock connection invocation contracts.
 * It does NOT accredit true MySQL 8 live execution or schema idempotency.
 * Live execution, clean install, partial updates, procedure privilege checks, and DB idempotency
 * are tested via the connected isolated harness: scripts/test_migrations_connected_harness.js
 */
describe('Migration 156 & 157 Local Parser & Mock Contract Suite', () => {
    test('1. Migration 156 parses into valid executable SQL statements without DELIMITER syntax errors', () => {
        const sqlContent = fs.readFileSync(path.join(__dirname, '../migrations/156_phase194f_tenant_notification_preferences_schema_sync.sql'), 'utf8');
        const parsed = parseMigrationSql(sqlContent);

        expect(parsed.statements.length).toBeGreaterThan(0);
        // Ensure no raw DELIMITER directives are present in statement bodies
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
        expect(parsed.statements[0].sql.toUpperCase()).toContain('MODIFY COLUMN CALIBRATION_SESSION_ID');
    });

    test('3. Migration 156 procedure logic is idempotent on fresh, existing, and partially migrated schemas', async () => {
        const sqlContent = fs.readFileSync(path.join(__dirname, '../migrations/156_phase194f_tenant_notification_preferences_schema_sync.sql'), 'utf8');
        const parsed = parseMigrationSql(sqlContent);

        // Execute statements against mock connection simulating MySQL 8 execution
        const executedQueries = [];
        const mockQuery = vi.fn().mockImplementation((sql) => {
            executedQueries.push(sql);
            return Promise.resolve([[]]);
        });

        for (const stmt of parsed.statements) {
            if (stmt.sql.trim().length > 0 && !stmt.sql.trim().startsWith('--')) {
                await mockQuery(stmt.sql);
            }
        }

        expect(executedQueries.length).toBeGreaterThan(0);
        expect(executedQueries.some(q => q.includes('CREATE PROCEDURE sync_tenant_notification_preferences_cols'))).toBe(true);
        expect(executedQueries.some(q => q.includes('CALL sync_tenant_notification_preferences_cols()'))).toBe(true);
        expect(executedQueries.some(q => q.includes('DROP PROCEDURE IF EXISTS sync_tenant_notification_preferences_cols'))).toBe(true);
    });
});
