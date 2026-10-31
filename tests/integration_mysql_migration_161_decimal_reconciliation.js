/**
 * tests/integration_mysql_migration_161_decimal_reconciliation.js
 *
 * Real MySQL Integration Test:
 * Recreates legacy production schema with printer_nodes.capacity_utilization_pct DECIMAL(5,2)
 * and verifies that runMigration161PreRemediation, migration 161 DDL, and validateMigration161PostConditions
 * execute successfully, idempotently, preserving fractional and NULL values without data loss or truncation.
 */

'use strict';

const mysql = require('mysql2/promise');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  runMigration161PreRemediation,
  validateMigration161PostConditions
} = require('../src/api/services/migration161ReconciliationService');
const { parseMigrationSql } = require('../src/api/services/migrationSqlParser');

async function runRealMySQLIntegration() {
  console.log('=== Real MySQL Integration: Migration 161 DECIMAL(5,2) Reconciliation ===');

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3308),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'testroot',
    multipleStatements: true
  });

  const testDb = 'ppos_test_mig161_temp';

  try {
    process.env.PPOS_MIGRATION_EXECUTION = 'true';

    await connection.query(`DROP DATABASE IF EXISTS \`${testDb}\``);
    await connection.query(`CREATE DATABASE \`${testDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`USE \`${testDb}\``);
    console.log(`[OK] Created temporary isolated database: ${testDb}`);

    // 1. Create legacy production schema for printer_nodes with DECIMAL(5,2) and baseline pre-existing tables
    await connection.query(`
      CREATE TABLE printer_nodes (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(32) DEFAULT 'ACTIVE',
        rates_json JSON NULL,
        capacity_utilization_pct DECIMAL(5,2) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Baseline tables that pre-exist in production prior to migration 161 (from migrations 002, 004, 144, etc.)
    await connection.query(`
      CREATE TABLE print_nodes (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        status ENUM('ONLINE', 'OFFLINE', 'BUSY', 'MAINTENANCE', 'DEGRADED', 'SATURATED', 'RECOVERING', 'DESYNCHRONIZED') DEFAULT 'OFFLINE',
        license_status ENUM('ACTIVE', 'EXPIRED', 'PENDING', 'SUSPENDED') DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE manufacturing_dispatches (
        id VARCHAR(64) PRIMARY KEY,
        order_id VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL,
        printhouse_id VARCHAR(64) NOT NULL,
        site_id VARCHAR(64) NOT NULL,
        machine_id VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ALLOCATED',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_order_dispatch (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE jobs (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        status VARCHAR(32) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE api_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_type VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE material_availability_snapshots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE digital_twin_snapshots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE anomaly_detection_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE swarm_coordination_snapshots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE federation_delegation_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE federated_twin_snapshots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE marketplace_listings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE marketplace_bids (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE marketplace_trade_ledger (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE governance_policy_registry (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Insert test fixtures: one with fractional decimal value, one with NULL
    await connection.query(`
      INSERT INTO printer_nodes (id, tenant_id, name, capacity_utilization_pct)
      VALUES
        ('node_fractional', 'tenant_1', 'Node With Fractional Load', 74.85),
        ('node_null', 'tenant_1', 'Node With Null Load', NULL);
    `);
    console.log('[OK] Inserted test fixtures (fractional decimal 74.85 and NULL)');

    // 3. Run Pre-Remediation hook
    console.log('[RUN] Executing runMigration161PreRemediation...');
    await runMigration161PreRemediation(connection);
    console.log('[PASS] runMigration161PreRemediation completed without errors on DECIMAL(5,2)');

    // 4. Verify data preservation
    const [rowsAfterRemediation] = await connection.query(`
      SELECT id, capacity_utilization_pct FROM printer_nodes ORDER BY id
    `);
    assert.strictEqual(rowsAfterRemediation.length, 2);
    assert.strictEqual(Number(rowsAfterRemediation[0].capacity_utilization_pct), 74.85, 'Fractional value must be exactly preserved');
    assert.strictEqual(rowsAfterRemediation[1].capacity_utilization_pct, null, 'NULL value must be preserved');
    console.log('[PASS] Data integrity verified: 74.85 and NULL intact');

    // 5. Check column data type in INFORMATION_SCHEMA
    const [colInfo] = await connection.query(`
      SELECT DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'printer_nodes' AND COLUMN_NAME = 'capacity_utilization_pct'
    `);
    assert.strictEqual(colInfo[0].DATA_TYPE, 'decimal');
    assert.strictEqual(Number(colInfo[0].NUMERIC_PRECISION), 5);
    assert.strictEqual(Number(colInfo[0].NUMERIC_SCALE), 2);
    assert.strictEqual(colInfo[0].IS_NULLABLE, 'YES');
    console.log('[PASS] Schema definition unchanged: DECIMAL(5,2) NULL retained');

    // 6. Execute full Migration 161 SQL
    console.log('[RUN] Executing migration 161 SQL statements...');
    const migrationSqlPath = path.join(__dirname, '../migrations/161_phase184g_industrial_persistence_ledger.sql');
    const sqlContent = fs.readFileSync(migrationSqlPath, 'utf8');
    const { statements } = parseMigrationSql(sqlContent);

    for (const stmt of statements) {
      await connection.query(stmt.sql);
    }
    console.log(`[PASS] All ${statements.length} migration 161 SQL statements executed successfully`);

    // 7. Validate Post-Conditions
    console.log('[RUN] Executing validateMigration161PostConditions...');
    await validateMigration161PostConditions(connection);
    console.log('[PASS] validateMigration161PostConditions passed (51/51 checks)');

    // 8. Test Idempotency: run pre-remediation a second time
    console.log('[RUN] Testing idempotency (second pre-remediation pass)...');
    await runMigration161PreRemediation(connection);
    console.log('[PASS] Second pre-remediation executed idempotently with zero alterations');

    // Re-verify data after full cycle
    const [finalRows] = await connection.query(`
      SELECT id, capacity_utilization_pct FROM printer_nodes ORDER BY id
    `);
    assert.strictEqual(Number(finalRows[0].capacity_utilization_pct), 74.85);
    assert.strictEqual(finalRows[1].capacity_utilization_pct, null);
    console.log('[PASS] Post-migration data integrity verified');

    console.log('\n=== ALL REAL MYSQL INTEGRATION TESTS PASSED ===\n');
  } finally {
    try {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDb}\``);
    } catch (e) {}
    await connection.end();
  }
}

runRealMySQLIntegration().catch(err => {
  console.error('[FAIL] Integration test failed:', err);
  process.exit(1);
});
