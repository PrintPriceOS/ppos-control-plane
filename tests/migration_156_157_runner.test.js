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
