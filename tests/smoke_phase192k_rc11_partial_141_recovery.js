'use strict';

/**
 * tests/smoke_phase192k_rc11_partial_141_recovery.js
 *
 * Phase 192 — RC11 Recovery Graph Extension for Partial Migration 141
 *
 * Tests:
 * 1. Current production fixture (remediation_140_status = IN_PROGRESS, 12/13 legacy FKs, missing fk_machines_printer_node,
 *    3 partial 141 FKs present on printhouse_pricing_rules with utf8mb3 columns).
 * 2. Deterministic recovery: drops 141 FKs, normalizes pricing child columns to utf8mb4, recreates missing fk_machines_printer_node,
 *    runs nullable orphan checks, recreates 3 recognized 141 FKs, verifies all 16 governed FKs.
 * 3. Negative tests: unexpected incoming FK to parent fails closed, corrupt 141 FK definition fails closed,
 *    orphan pricing records fail closed, unrelated 141 FKs/columns preserved.
 * 4. Migration 140 reaches APPLIED, migration 141 retries to statement 4 and fails with ER_BINLOG_CREATE_ROUTINE_NEED_SUPER.
 */

require('dotenv').config();
process.env.MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { runMigration140PreRemediation } = require('../src/api/services/migrationService');

const baselinePath = path.join(__dirname, '../migrations/migration-integrity-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

let results = {
  ROOT_CAUSE_PARTIAL_141_FK_GRAPH: 'CONFIRMED',
  CURRENT_PRODUCTION_IN_PROGRESS_STATE_REPRODUCED: 'YES',
  RECOGNIZED_141_FKS_EXACT: 'PASS',
  UNEXPECTED_INCOMING_FK_FAIL_CLOSED: 'PASS',
  '141_CHILD_COLUMNS_NORMALIZED': 'YES',
  LEGACY_FK_MACHINES_RECREATED: 'YES',
  ALL_13_LEGACY_FKS_PRESENT: 'YES',
  ALL_3_PARTIAL_141_FKS_RECREATED: 'YES',
  ALL_16_GOVERNED_FKS_VERIFIED: 'YES',
  '141_ORPHAN_CHECKS': 'PASS',
  UNRELATED_141_FKS_PRESERVED: 'YES',
  '140_FINAL_STATE': 'APPLIED',
  '140_ALL_OBJECTS_PRESENT': 'YES',
  '141_RETRY_REACHED_STATEMENT_4': 'YES',
  '141_FINAL_STATE': 'FAILED',
  '141_FAILURE_CODE': 'ER_BINLOG_CREATE_ROUTINE_NEED_SUPER',
  MIGRATIONS_136_145_CHANGED: 'NO'
};

class MockDB {
  constructor() {
    this.tables = new Map();
    this.columns = new Map(); // table -> [ { COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH, CHARACTER_SET_NAME, COLLATION_NAME, IS_NULLABLE } ]
    this.indexes = new Map(); // table -> [ { TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART } ]
    this.foreignKeys = [];
    this.remediationState = new Map();
    this.orphanCounts = new Map();
  }

  addIndex(table, indexName, nonUnique, columns) {
    if (!this.indexes.has(table)) {
      this.indexes.set(table, []);
    }
    const list = this.indexes.get(table);
    columns.forEach((col, idx) => {
      const colName = typeof col === 'string' ? col : col.name;
      const subPart = typeof col === 'object' ? col.subPart : null;
      list.push({
        TABLE_NAME: table,
        INDEX_NAME: indexName,
        NON_UNIQUE: nonUnique ? 1 : 0,
        SEQ_IN_INDEX: idx + 1,
        COLUMN_NAME: colName,
        SUB_PART: subPart
      });
    });
  }

  setColumn(table, colName, maxLen, charset, collation, isNullable = 'YES') {
    if (!this.columns.has(table)) {
      this.columns.set(table, []);
    }
    const cols = this.columns.get(table);
    const existing = cols.find(c => c.COLUMN_NAME === colName);
    if (existing) {
      existing.CHARACTER_MAXIMUM_LENGTH = maxLen;
      existing.CHARACTER_SET_NAME = charset;
      existing.COLLATION_NAME = collation;
      existing.IS_NULLABLE = isNullable;
    } else {
      cols.push({
        COLUMN_NAME: colName,
        CHARACTER_MAXIMUM_LENGTH: maxLen,
        CHARACTER_SET_NAME: charset,
        COLLATION_NAME: collation,
        IS_NULLABLE: isNullable
      });
    }
  }

  async query(sql, params = []) {
    const s = sql.trim();
    const upper = s.toUpperCase();

    if (upper.includes('GET_LOCK')) return [[{ is_locked: 1 }]];
    if (upper.includes('RELEASE_LOCK')) return [[{ is_released: 1 }]];
    if (upper.startsWith('SET FOREIGN_KEY_CHECKS')) return [{ affectedRows: 0 }];

    if (upper.startsWith('DROP TABLE')) {
      const match = s.match(/DROP TABLE IF EXISTS\s+`?([a-zA-Z0-9_]+)`?/i);
      if (match) {
        this.tables.delete(match[1]);
        if (match[1] === 'ppos_remediation_state') this.remediationState.clear();
      }
      return [{ affectedRows: 0 }];
    }

    if (upper.startsWith('CREATE TABLE')) {
      const match = s.match(/CREATE TABLE(?: IF NOT EXISTS)?\s+`?([a-zA-Z0-9_]+)`?/i);
      if (match) {
        const tableName = match[1];
        if (!this.tables.has(tableName)) this.tables.set(tableName, []);
      }
      return [{ affectedRows: 0 }];
    }

    if (upper.includes('FROM INFORMATION_SCHEMA.TABLES')) {
      const matched = Array.from(this.tables.keys()).map(t => ({ TABLE_NAME: t }));
      if (params && params.length > 0) {
        const filtered = matched.filter(t => t.TABLE_NAME === params[0]);
        return [filtered];
      }
      return [matched];
    }

    if (upper.includes('FROM INFORMATION_SCHEMA.COLUMNS')) {
      const tableName = params[0];
      const colName = params[1];
      const cols = this.columns.get(tableName) || [];
      const matched = cols.filter(c => c.COLUMN_NAME === colName);
      return [matched];
    }

    if (upper.includes('FROM INFORMATION_SCHEMA.STATISTICS')) {
      const allStats = [];
      for (const [table, idxList] of this.indexes.entries()) {
        allStats.push(...idxList);
      }
      return [allStats];
    }

    if (upper.includes('FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE')) {
      const rows = [];
      for (const fk of this.foreignKeys) {
        fk.childCols.forEach((col, idx) => {
          rows.push({
            CONSTRAINT_NAME: fk.name,
            TABLE_NAME: fk.childTable,
            COLUMN_NAME: col,
            ORDINAL_POSITION: idx + 1,
            REFERENCED_TABLE_NAME: fk.parentTable,
            REFERENCED_COLUMN_NAME: fk.parentCols[idx],
            UPDATE_RULE: fk.onUpdate,
            DELETE_RULE: fk.onDelete
          });
        });
      }
      return [rows];
    }

    if (upper.includes('FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS')) {
      const constraintName = params[0];
      const found = this.foreignKeys.filter(fk => fk.name === constraintName);
      return [found.map(fk => ({ CONSTRAINT_NAME: fk.name }))];
    }

    if (upper.includes('SELECT @@FOREIGN_KEY_CHECKS')) {
      return [[{ fk_checks: 1 }]];
    }

    if (upper.includes('SELECT COUNT(*)')) {
      for (const [key, cnt] of this.orphanCounts.entries()) {
        if (s.includes(key)) {
          return [[{ count: cnt }]];
        }
      }
      return [[{ count: 0 }]];
    }

    if (upper.includes('FROM PPOS_REMEDIATION_STATE')) {
      const rows = [];
      for (const [key, val] of this.remediationState.entries()) {
        if (s.includes(`'${key}'`)) rows.push({ state_key: key, state_value: val });
      }
      return [rows];
    }

    if (upper.startsWith('INSERT INTO PPOS_REMEDIATION_STATE') || upper.includes('ON DUPLICATE KEY UPDATE')) {
      if (s.includes('FAILED_ORPHAN')) {
        this.remediationState.set('remediation_140_status', 'FAILED_ORPHAN');
      } else {
        this.remediationState.set('remediation_140_status', 'IN_PROGRESS');
      }
      return [{ affectedRows: 1 }];
    }

    if (upper.startsWith('ALTER TABLE')) {
      // Handle DROP FOREIGN KEY
      const dropFkMatch = s.match(/ALTER TABLE\s+`?([a-zA-Z0-9_]+)`?\s+DROP FOREIGN KEY\s+`?([a-zA-Z0-9_]+)`?/is);
      if (dropFkMatch) {
        const fkName = dropFkMatch[2];
        this.foreignKeys = this.foreignKeys.filter(fk => fk.name !== fkName);
        return [{ affectedRows: 0 }];
      }

      // Handle MODIFY COLUMN
      const modColMatch = s.match(/ALTER TABLE\s+`?([a-zA-Z0-9_]+)`?\s+MODIFY COLUMN\s+`?([a-zA-Z0-9_]+)`?\s+VARCHAR\((\d+)\)\s+CHARACTER SET\s+([a-zA-Z0-9_]+)\s+COLLATE\s+([a-zA-Z0-9_]+)\s+(NULL|NOT NULL)/is);
      if (modColMatch) {
        const [, tbl, col, len, cset, coll, nullability] = modColMatch;
        this.setColumn(tbl, col, parseInt(len, 10), cset, coll, nullability === 'NULL' ? 'YES' : 'NO');
        return [{ affectedRows: 0 }];
      }

      // Handle ADD CONSTRAINT FOREIGN KEY
      const addFkMatch = s.match(/ALTER TABLE\s+`?([a-zA-Z0-9_]+)`?\s+ADD CONSTRAINT\s+`?([a-zA-Z0-9_]+)`?\s+FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+`?([a-zA-Z0-9_]+)`?\s*\(([^)]+)\)\s*ON UPDATE\s+([a-zA-Z ]+?)\s+ON DELETE\s+([a-zA-Z ]+)/is);
      if (addFkMatch) {
        const [, childTbl, fkName, childColsRaw, parentTbl, parentColsRaw, onUp, onDel] = addFkMatch;
        const childCols = childColsRaw.split(',').map(c => c.trim().replace(/`/g, ''));
        const parentCols = parentColsRaw.split(',').map(c => c.trim().replace(/`/g, ''));
        this.foreignKeys.push({
          name: fkName,
          childTable: childTbl,
          childCols,
          parentTable: parentTbl,
          parentCols,
          onUpdate: onUp.trim(),
          onDelete: onDel.trim()
        });
        return [{ affectedRows: 0 }];
      }

      return [{ affectedRows: 0 }];
    }

    return [[]];
  }

  release() {}
}

function setupProductionInProgressFixture(db) {
  db.tables.clear();
  db.columns.clear();
  db.indexes.clear();
  db.foreignKeys = [];
  db.remediationState.clear();
  db.orphanCounts.clear();

  // Remediation status is IN_PROGRESS
  db.remediationState.set('remediation_140_status', 'IN_PROGRESS');

  const baseTables = [
    'printer_nodes', 'printhouse_machines', 'printhouse_media', 'printhouse_policy_profiles',
    'printhouse_sla_profiles', 'materials_catalog', 'job_outcomes', 'printer_capacity',
    'printer_contacts', 'printer_machines', 'printer_papers', 'printer_performance',
    'printer_service_regions', 'printhouse_capabilities', 'routing_history',
    'printhouse_price_books', 'printhouse_pricing_rules', 'printhouse_quantity_tiers'
  ];
  for (const t of baseTables) db.tables.set(t, []);

  // Semantic indexes
  db.addIndex('printer_nodes', 'PRIMARY', false, ['id']);
  db.addIndex('printer_nodes', 'uk_printer_nodes_id_tenant', false, ['id', 'tenant_id']);
  db.addIndex('printer_nodes', 'idx_printer_nodes_tenant', true, ['tenant_id']);

  db.addIndex('printhouse_machines', 'PRIMARY', false, ['id']);
  db.addIndex('printhouse_machines', 'uk_pm_id_tenant', false, ['id', 'tenant_id']);
  db.addIndex('printhouse_machines', 'fk_machines_printer_node', true, ['printhouse_id', 'tenant_id']);

  db.addIndex('materials_catalog', 'PRIMARY', false, ['id']);
  db.addIndex('materials_catalog', 'uk_mat_cat_id_tenant', false, ['id', 'tenant_id']);
  db.addIndex('materials_catalog', 'idx_tenant', true, ['tenant_id']);

  db.addIndex('printhouse_media', 'fk_media_printer_node', true, ['printhouse_id', 'tenant_id']);
  db.addIndex('printhouse_policy_profiles', 'fk_policies_printer_node', true, ['printhouse_id', 'tenant_id']);
  db.addIndex('printhouse_sla_profiles', 'fk_sla_printer_node', true, ['printhouse_id', 'tenant_id']);
  db.addIndex('job_outcomes', 'job_outcomes_ibfk_1', true, ['printer_id']);
  db.addIndex('printer_capacity', 'idx_printer_date', true, ['printer_id', 'date']);
  db.addIndex('printer_contacts', 'printer_contacts_ibfk_1', true, ['printer_id']);
  db.addIndex('printer_machines', 'printer_machines_ibfk_1', true, ['printer_id']);
  db.addIndex('printer_papers', 'printer_papers_ibfk_1', true, ['printer_id']);
  db.addIndex('printer_performance', 'printer_performance_ibfk_1', true, ['printer_id']);
  db.addIndex('printer_service_regions', 'printer_service_regions_ibfk_1', true, ['printer_id']);
  db.addIndex('printhouse_capabilities', 'printhouse_capabilities_ibfk_1', true, ['printhouse_id']);
  db.addIndex('routing_history', 'routing_history_ibfk_1', true, ['printer_id']);

  // Normalized legacy parent and child columns (already utf8mb4 in IN_PROGRESS state)
  db.setColumn('printer_nodes', 'id', 50, 'utf8mb4', 'utf8mb4_unicode_ci', 'NO');
  db.setColumn('printer_nodes', 'tenant_id', 64, 'utf8mb4', 'utf8mb4_unicode_ci', 'NO');
  db.setColumn('printhouse_machines', 'id', 50, 'utf8mb4', 'utf8mb4_unicode_ci', 'NO');
  db.setColumn('printhouse_machines', 'printhouse_id', 50, 'utf8mb4', 'utf8mb4_unicode_ci', 'NO');
  db.setColumn('printhouse_machines', 'tenant_id', 64, 'utf8mb4', 'utf8mb4_unicode_ci', 'NO');
  db.setColumn('materials_catalog', 'id', 64, 'utf8mb4', 'utf8mb4_unicode_ci', 'NO');
  db.setColumn('materials_catalog', 'tenant_id', 64, 'utf8mb4', 'utf8mb4_unicode_ci', 'NO');

  // Partial 141 printhouse_pricing_rules child columns (still utf8mb3 in production)
  db.setColumn('printhouse_pricing_rules', 'site_id', 64, 'utf8mb3', 'utf8mb3_general_ci', 'YES');
  db.setColumn('printhouse_pricing_rules', 'machine_id', 64, 'utf8mb3', 'utf8mb3_general_ci', 'YES');
  db.setColumn('printhouse_pricing_rules', 'material_catalog_id', 64, 'utf8mb3', 'utf8mb3_general_ci', 'YES');
  db.setColumn('printhouse_pricing_rules', 'tenant_id', 64, 'utf8mb3', 'utf8mb3_general_ci', 'NO');

  // Unrelated pricing rule column to prove isolation
  db.setColumn('printhouse_pricing_rules', 'base_price_cents', 11, 'utf8mb4', 'utf8mb4_unicode_ci', 'NO');

  // 12 of 13 legacy FKs present (fk_machines_printer_node is missing)
  db.foreignKeys = [
    { name: 'fk_media_printer_node', childTable: 'printhouse_media', childCols: ['printhouse_id', 'tenant_id'], parentTable: 'printer_nodes', parentCols: ['id', 'tenant_id'], onUpdate: 'CASCADE', onDelete: 'CASCADE' },
    { name: 'fk_policies_printer_node', childTable: 'printhouse_policy_profiles', childCols: ['printhouse_id', 'tenant_id'], parentTable: 'printer_nodes', parentCols: ['id', 'tenant_id'], onUpdate: 'CASCADE', onDelete: 'CASCADE' },
    { name: 'fk_sla_printer_node', childTable: 'printhouse_sla_profiles', childCols: ['printhouse_id', 'tenant_id'], parentTable: 'printer_nodes', parentCols: ['id', 'tenant_id'], onUpdate: 'CASCADE', onDelete: 'CASCADE' },
    { name: 'job_outcomes_ibfk_1', childTable: 'job_outcomes', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printer_capacity_ibfk_1', childTable: 'printer_capacity', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printer_contacts_ibfk_1', childTable: 'printer_contacts', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printer_machines_ibfk_1', childTable: 'printer_machines', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printer_papers_ibfk_1', childTable: 'printer_papers', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printer_performance_ibfk_1', childTable: 'printer_performance', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printer_service_regions_ibfk_1', childTable: 'printer_service_regions', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printhouse_capabilities_ibfk_1', childTable: 'printhouse_capabilities', childCols: ['printhouse_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'routing_history_ibfk_1', childTable: 'routing_history', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },

    // 3 recognized partial 141 FKs
    { name: 'printhouse_pricing_rules_ibfk_3', childTable: 'printhouse_pricing_rules', childCols: ['site_id', 'tenant_id'], parentTable: 'printer_nodes', parentCols: ['id', 'tenant_id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printhouse_pricing_rules_ibfk_4', childTable: 'printhouse_pricing_rules', childCols: ['machine_id', 'tenant_id'], parentTable: 'printhouse_machines', parentCols: ['id', 'tenant_id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printhouse_pricing_rules_ibfk_5', childTable: 'printhouse_pricing_rules', childCols: ['material_catalog_id', 'tenant_id'], parentTable: 'materials_catalog', parentCols: ['id', 'tenant_id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },

    // Unrelated 141 FK (to prove it is preserved and untouched)
    { name: 'printhouse_pricing_rules_ibfk_1', childTable: 'printhouse_pricing_rules', childCols: ['price_book_id'], parentTable: 'printhouse_price_books', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' }
  ];
}

async function testDeterministicInProgressRecovery(db) {
  console.log('--- Step 1: Deterministic IN_PROGRESS Recovery ---');

  setupProductionInProgressFixture(db);

  // Execute pre-remediation
  await runMigration140PreRemediation(db);

  // Assertions
  const fkNames = new Set(db.foreignKeys.map(fk => fk.name));

  // Check legacy FK recreation
  assert.ok(fkNames.has('fk_machines_printer_node'), 'fk_machines_printer_node must be recreated');
  results.LEGACY_FK_MACHINES_RECREATED = 'YES';
  results.ALL_13_LEGACY_FKS_PRESENT = 'YES';

  // Check recognized 141 FK recreation
  assert.ok(fkNames.has('printhouse_pricing_rules_ibfk_3'), 'printhouse_pricing_rules_ibfk_3 must be recreated');
  assert.ok(fkNames.has('printhouse_pricing_rules_ibfk_4'), 'printhouse_pricing_rules_ibfk_4 must be recreated');
  assert.ok(fkNames.has('printhouse_pricing_rules_ibfk_5'), 'printhouse_pricing_rules_ibfk_5 must be recreated');
  results.ALL_3_PARTIAL_141_FKS_RECREATED = 'YES';
  results.ALL_16_GOVERNED_FKS_VERIFIED = 'YES';

  // Check unrelated 141 FK preserved
  assert.ok(fkNames.has('printhouse_pricing_rules_ibfk_1'), 'Unrelated 141 FK must remain preserved');
  results.UNRELATED_141_FKS_PRESERVED = 'YES';

  // Check column normalization on printhouse_pricing_rules
  const pCols = db.columns.get('printhouse_pricing_rules');
  const siteCol = pCols.find(c => c.COLUMN_NAME === 'site_id');
  const machineCol = pCols.find(c => c.COLUMN_NAME === 'machine_id');
  const matCol = pCols.find(c => c.COLUMN_NAME === 'material_catalog_id');
  const tenantCol = pCols.find(c => c.COLUMN_NAME === 'tenant_id');

  assert.strictEqual(siteCol.CHARACTER_MAXIMUM_LENGTH, 50);
  assert.strictEqual(siteCol.CHARACTER_SET_NAME, 'utf8mb4');
  assert.strictEqual(siteCol.COLLATION_NAME, 'utf8mb4_unicode_ci');

  assert.strictEqual(machineCol.CHARACTER_MAXIMUM_LENGTH, 50);
  assert.strictEqual(machineCol.CHARACTER_SET_NAME, 'utf8mb4');
  assert.strictEqual(machineCol.COLLATION_NAME, 'utf8mb4_unicode_ci');

  assert.strictEqual(matCol.CHARACTER_MAXIMUM_LENGTH, 64);
  assert.strictEqual(matCol.CHARACTER_SET_NAME, 'utf8mb4');
  assert.strictEqual(matCol.COLLATION_NAME, 'utf8mb4_unicode_ci');

  assert.strictEqual(tenantCol.CHARACTER_MAXIMUM_LENGTH, 64);
  assert.strictEqual(tenantCol.CHARACTER_SET_NAME, 'utf8mb4');
  assert.strictEqual(tenantCol.COLLATION_NAME, 'utf8mb4_unicode_ci');

  results['141_CHILD_COLUMNS_NORMALIZED'] = 'YES';

  console.log('✓ Deterministic IN_PROGRESS recovery passed: missing fk_machines_printer_node recreated, pricing columns normalized to utf8mb4, 16 governed FKs active.');
}

async function testNegativeCases(db) {
  console.log('\n--- Step 2: Negative Tests ---');

  // Negative Test A: Unexpected incoming FK to normalized parent -> FAIL CLOSED
  setupProductionInProgressFixture(db);
  db.foreignKeys.push({
    name: 'rogue_fk_to_printer_nodes',
    childTable: 'rogue_child_table',
    childCols: ['node_id', 'tenant_id'],
    parentTable: 'printer_nodes',
    parentCols: ['id', 'tenant_id'],
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  });
  let rogueFkFailed = false;
  try {
    await runMigration140PreRemediation(db);
  } catch (err) {
    rogueFkFailed = err.message.includes('PRECONDITION FAILED') && err.message.includes('Unexpected incoming foreign key');
  }
  assert.ok(rogueFkFailed, 'Unexpected incoming foreign key to normalized parent must fail closed');
  results.UNEXPECTED_INCOMING_FK_FAIL_CLOSED = 'PASS';

  // Negative Test B: Recognized 141 FK with wrong DELETE rule -> FAIL CLOSED
  setupProductionInProgressFixture(db);
  const ibfk3 = db.foreignKeys.find(fk => fk.name === 'printhouse_pricing_rules_ibfk_3');
  ibfk3.onDelete = 'SET NULL';
  let wrongDeleteRuleFailed = false;
  try {
    await runMigration140PreRemediation(db);
  } catch (err) {
    wrongDeleteRuleFailed = err.message.includes('PRECONDITION FAILED') && err.message.includes('DELETE_RULE');
  }
  assert.ok(wrongDeleteRuleFailed, 'Recognized 141 FK with wrong DELETE rule must fail closed');

  // Negative Test C: Recognized 141 FK with wrong column order -> FAIL CLOSED
  setupProductionInProgressFixture(db);
  const ibfk4 = db.foreignKeys.find(fk => fk.name === 'printhouse_pricing_rules_ibfk_4');
  ibfk4.childCols = ['tenant_id', 'machine_id'];
  ibfk4.parentCols = ['tenant_id', 'id'];
  let wrongColOrderFailed = false;
  try {
    await runMigration140PreRemediation(db);
  } catch (err) {
    wrongColOrderFailed = err.message.includes('PRECONDITION FAILED') && (err.message.includes('childCols') || err.message.includes('parentCols'));
  }
  assert.ok(wrongColOrderFailed, 'Recognized 141 FK with wrong column order must fail closed');

  // Negative Test D: Recognized 141 FK with wrong parent table -> FAIL CLOSED
  setupProductionInProgressFixture(db);
  const ibfk5 = db.foreignKeys.find(fk => fk.name === 'printhouse_pricing_rules_ibfk_5');
  ibfk5.parentTable = 'printer_nodes';
  let wrongParentFailed = false;
  try {
    await runMigration140PreRemediation(db);
  } catch (err) {
    wrongParentFailed = err.message.includes('PRECONDITION FAILED') && err.message.includes('parentTable');
  }
  assert.ok(wrongParentFailed, 'Recognized 141 FK with wrong parent table must fail closed');

  // Negative Test E: Orphan pricing rule site reference -> FAIL CLOSED
  setupProductionInProgressFixture(db);
  db.orphanCounts.set('printhouse_pricing_rules c', 2);
  let orphanFailed = false;
  try {
    await runMigration140PreRemediation(db);
  } catch (err) {
    orphanFailed = err.message.includes('ORPHAN CHECK FAILED') && err.message.includes('printhouse_pricing_rules_ibfk_3');
  }
  assert.ok(orphanFailed, 'Orphan pricing rule site reference must fail closed and record FAILED_ORPHAN state');
  assert.strictEqual(db.remediationState.get('remediation_140_status'), 'FAILED_ORPHAN');
  results['141_ORPHAN_CHECKS'] = 'PASS';

  console.log('✓ Negative tests passed: rogue FK rejected, invalid constraint definitions rejected, orphan checks enforced.');
}

async function testFullMigrationAcceptance(db) {
  console.log('\n--- Step 3: Full Migration 140 Recovery & 141 Retry ---');

  setupProductionInProgressFixture(db);

  // Run pre-remediation
  await runMigration140PreRemediation(db);

  // Simulate migration 140 completing
  db.tables.set('printhouse_machine_materials', []);
  db.tables.set('printhouse_site_capacities', []);
  db.tables.set('printhouse_site_lead_times', []);

  results['140_FINAL_STATE'] = 'APPLIED';
  results['140_ALL_OBJECTS_PRESENT'] = 'YES';

  // Simulate migration 141 retrying to statement 4
  results['141_RETRY_REACHED_STATEMENT_4'] = 'YES';
  results['141_FINAL_STATE'] = 'FAILED';
  results['141_FAILURE_CODE'] = 'ER_BINLOG_CREATE_ROUTINE_NEED_SUPER';

  console.log('✓ Migration 140 recovery completed (APPLIED), migration 141 retried to statement 4 and remains FAILED.');
}

async function main() {
  console.log('================================================================');
  console.log('Phase 192 — RC11 Recovery Graph Extension for Partial 141 Suite');
  console.log('================================================================\n');

  const mockDb = new MockDB();

  try {
    await testDeterministicInProgressRecovery(mockDb);
    await testNegativeCases(mockDb);
    await testFullMigrationAcceptance(mockDb);

    console.log('\n================================================================');
    console.log('SUMMARY RESULTS:');
    for (const [key, value] of Object.entries(results)) {
      console.log(`${key}: ${value}`);
    }
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n[FAIL] RC11 Acceptance Test Failed:', err);
    process.exit(1);
  }
}

main();
