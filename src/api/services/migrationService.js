'use strict';

/**
 * src/api/services/migrationService.js
 * 
 * Industrial Migration Engine for PPOS Control Plane (Phase 185).
 * Governs schema versions using a secure state machine, checksum checks, and concurrency locks.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const logger = require('./logger').child('migration-service');
const migrationIntegrity = require('../../../scripts/lib/migrationIntegrity');

const ledgerRead = require('./migrationLedgerReadService');
const ledgerWrite = require('./migrationLedgerWriteService');
const { parseMigrationSql } = require('./migrationSqlParser');

async function ensurePreviousFailuresColumn(connOrDb) {
  try {
    const tableCheck = await connOrDb.query(`
      SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_versions'
    `);
    if (!tableCheck || tableCheck.length === 0) return;

    await connOrDb.query('ALTER TABLE schema_versions ADD COLUMN previous_failures JSON NULL');
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME' && err.errno !== 1060) {
      throw err;
    }
  }
}

async function runMigration140PreRemediation(connOrDb) {
  logger.info({ event: 'migration_remediation_140_start', message: 'Evaluating governed schema normalization pre-remediation for migration 140' });

  // 1. EXACT TABLE PRECONDITION — no filtering; all 15 tables must exist or abort
  const expectedTables = [
    'printer_nodes',
    'printhouse_machines',
    'printhouse_media',
    'printhouse_policy_profiles',
    'printhouse_sla_profiles',
    'materials_catalog',
    'job_outcomes',
    'printer_capacity',
    'printer_contacts',
    'printer_machines',
    'printer_papers',
    'printer_performance',
    'printer_service_regions',
    'printhouse_capabilities',
    'routing_history'
  ];

  const [tablesRows] = await connOrDb.query(`
    SELECT TABLE_NAME 
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = DATABASE()
  `);
  const existingTables = new Set(tablesRows.map(t => t.TABLE_NAME));

  const missingTables = expectedTables.filter(t => !existingTables.has(t));
  if (missingTables.length > 0) {
    throw new Error(
      `PRECONDITION FAILED: Missing required tables.\n` +
      `  EXPECTED (${expectedTables.length}): [${expectedTables.join(', ')}]\n` +
      `  OBSERVED (${existingTables.size}): [${[...existingTables].sort().join(', ')}]\n` +
      `  MISSING: [${missingTables.join(', ')}]`
    );
  }

  // 2. SEMANTIC INDEX PRECONDITION
  // We validate semantic index requirements rather than brittle exact names.
  // Validates:
  // - required columns are the leftmost ordered columns of the index
  // - if uniqueRequired=true, NON_UNIQUE is 0
  // - SUB_PART is null (full column indexing)
  const semanticIndexRequirements = [
    // printer_nodes parent/composite keys
    { table: 'printer_nodes', columns: ['id'], uniqueRequired: true },
    { table: 'printer_nodes', columns: ['id', 'tenant_id'], uniqueRequired: true },
    { table: 'printer_nodes', columns: ['tenant_id'], uniqueRequired: false },

    // printhouse_machines
    { table: 'printhouse_machines', columns: ['id'], uniqueRequired: true },
    { table: 'printhouse_machines', columns: ['id', 'tenant_id'], uniqueRequired: true },
    { table: 'printhouse_machines', columns: ['printhouse_id', 'tenant_id'], uniqueRequired: false },

    // materials_catalog
    { table: 'materials_catalog', columns: ['id'], uniqueRequired: true },
    { table: 'materials_catalog', columns: ['id', 'tenant_id'], uniqueRequired: true },
    { table: 'materials_catalog', columns: ['tenant_id'], uniqueRequired: false },

    // Child FK supporting indexes
    { table: 'printhouse_media', columns: ['printhouse_id', 'tenant_id'], uniqueRequired: false },
    { table: 'printhouse_policy_profiles', columns: ['printhouse_id', 'tenant_id'], uniqueRequired: false },
    { table: 'printhouse_sla_profiles', columns: ['printhouse_id', 'tenant_id'], uniqueRequired: false },
    { table: 'job_outcomes', columns: ['printer_id'], uniqueRequired: false },
    { table: 'printer_capacity', columns: ['printer_id'], uniqueRequired: false },
    { table: 'printer_contacts', columns: ['printer_id'], uniqueRequired: false },
    { table: 'printer_machines', columns: ['printer_id'], uniqueRequired: false },
    { table: 'printer_papers', columns: ['printer_id'], uniqueRequired: false },
    { table: 'printer_performance', columns: ['printer_id'], uniqueRequired: false },
    { table: 'printer_service_regions', columns: ['printer_id'], uniqueRequired: false },
    { table: 'printhouse_capabilities', columns: ['printhouse_id'], uniqueRequired: false },
    { table: 'routing_history', columns: ['printer_id'], uniqueRequired: false }
  ];

  const [statRows] = await connOrDb.query(`
    SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
  `);

  // Build table -> indexName -> { name, nonUnique, columns: [ { name, subPart } ] }
  const tableIndexes = new Map();
  for (const row of statRows) {
    const tableName = row.TABLE_NAME;
    const indexName = row.INDEX_NAME;
    if (!tableIndexes.has(tableName)) {
      tableIndexes.set(tableName, new Map());
    }
    const idxMap = tableIndexes.get(tableName);
    if (!idxMap.has(indexName)) {
      idxMap.set(indexName, {
        name: indexName,
        nonUnique: Number(row.NON_UNIQUE) === 1,
        columns: []
      });
    }
    idxMap.get(indexName).columns.push({
      name: row.COLUMN_NAME,
      subPart: row.SUB_PART != null ? Number(row.SUB_PART) : null
    });
  }

  const missingIndexRequirements = [];

  for (const req of semanticIndexRequirements) {
    const idxMap = tableIndexes.get(req.table);
    if (!idxMap) {
      missingIndexRequirements.push(`${req.table}(${req.columns.join(', ')})${req.uniqueRequired ? ' [UNIQUE]' : ''}`);
      continue;
    }

    let satisfied = false;
    for (const [idxName, idxDef] of idxMap.entries()) {
      if (idxDef.columns.length < req.columns.length) {
        continue;
      }

      // Check leftmost columns
      let colsMatch = true;
      for (let i = 0; i < req.columns.length; i++) {
        const colDef = idxDef.columns[i];
        if (colDef.name.toLowerCase() !== req.columns[i].toLowerCase()) {
          colsMatch = false;
          break;
        }
        if (colDef.subPart !== null) {
          colsMatch = false;
          break;
        }
      }

      if (!colsMatch) {
        continue;
      }

      // Check uniqueness if required
      if (req.uniqueRequired) {
        if (idxDef.nonUnique) {
          continue; // Index is non-unique
        }
      }

      satisfied = true;
      break;
    }

    if (!satisfied) {
      missingIndexRequirements.push(`${req.table}(${req.columns.join(', ')})${req.uniqueRequired ? ' [UNIQUE]' : ''}`);
    }
  }

  if (missingIndexRequirements.length > 0) {
    throw new Error(`PRECONDITION FAILED: Missing required indexes:\n  ${missingIndexRequirements.join('\n  ')}`);
  }

  // 3. EXACT FK PRECONDITION — verified before any mutation in all states
  const EXPECTED_FKS = [
    { name: 'fk_machines_printer_node', childTable: 'printhouse_machines', childCols: ['printhouse_id', 'tenant_id'], parentTable: 'printer_nodes', parentCols: ['id', 'tenant_id'], onUpdate: 'CASCADE', onDelete: 'CASCADE' },
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
    { name: 'routing_history_ibfk_1', childTable: 'routing_history', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' }
  ];
  const EXPECTED_FK_COUNT = 13;
  if (EXPECTED_FKS.length !== EXPECTED_FK_COUNT) {
    // Internal integrity check — must never fail unless someone edits EXPECTED_FKS
    throw new Error(`INTERNAL ASSERTION FAILED: EXPECTED_FKS array has ${EXPECTED_FKS.length} entries, expected ${EXPECTED_FK_COUNT}.`);
  }

  // Recognized optional FKs from partial migration 141
  const RECOGNIZED_141_FKS = [
    {
      name: 'printhouse_pricing_rules_ibfk_3',
      childTable: 'printhouse_pricing_rules',
      childCols: ['site_id', 'tenant_id'],
      parentTable: 'printer_nodes',
      parentCols: ['id', 'tenant_id'],
      onUpdate: 'NO ACTION',
      onDelete: 'CASCADE'
    },
    {
      name: 'printhouse_pricing_rules_ibfk_4',
      childTable: 'printhouse_pricing_rules',
      childCols: ['machine_id', 'tenant_id'],
      parentTable: 'printhouse_machines',
      parentCols: ['id', 'tenant_id'],
      onUpdate: 'NO ACTION',
      onDelete: 'CASCADE'
    },
    {
      name: 'printhouse_pricing_rules_ibfk_5',
      childTable: 'printhouse_pricing_rules',
      childCols: ['material_catalog_id', 'tenant_id'],
      parentTable: 'materials_catalog',
      parentCols: ['id', 'tenant_id'],
      onUpdate: 'NO ACTION',
      onDelete: 'CASCADE'
    }
  ];

  // Read current FK graph from database
  const [fkRows] = await connOrDb.query(`
    SELECT 
        k.CONSTRAINT_NAME,
        k.TABLE_NAME,
        k.COLUMN_NAME,
        k.ORDINAL_POSITION,
        k.REFERENCED_TABLE_NAME,
        k.REFERENCED_COLUMN_NAME,
        r.UPDATE_RULE,
        r.DELETE_RULE
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.REFERENTIAL_CONSTRAINTS r 
      ON k.CONSTRAINT_NAME = r.CONSTRAINT_NAME 
      AND k.CONSTRAINT_SCHEMA = r.CONSTRAINT_SCHEMA
    WHERE k.CONSTRAINT_SCHEMA = DATABASE()
    ORDER BY k.CONSTRAINT_NAME, k.ORDINAL_POSITION
  `);

  const actualFks = {};
  for (const r of fkRows) {
    if (!actualFks[r.CONSTRAINT_NAME]) {
      actualFks[r.CONSTRAINT_NAME] = {
        name: r.CONSTRAINT_NAME,
        childTable: r.TABLE_NAME,
        childCols: [],
        parentTable: r.REFERENCED_TABLE_NAME,
        parentCols: [],
        onUpdate: r.UPDATE_RULE,
        onDelete: r.DELETE_RULE
      };
    }
    actualFks[r.CONSTRAINT_NAME].childCols.push(r.COLUMN_NAME);
    actualFks[r.CONSTRAINT_NAME].parentCols.push(r.REFERENCED_COLUMN_NAME);
  }

  // Helper: returns list of field-level discrepancies between an expected and actual FK
  function auditFkDefinition(expected, actual) {
    const errors = [];
    if (actual.childTable !== expected.childTable) {
      errors.push(`childTable: observed '${actual.childTable}', expected '${expected.childTable}'`);
    }
    if (actual.parentTable !== expected.parentTable) {
      errors.push(`parentTable: observed '${actual.parentTable}', expected '${expected.parentTable}'`);
    }
    const childColsObs = JSON.stringify(actual.childCols.map(c => c.toLowerCase()));
    const childColsExp = JSON.stringify(expected.childCols.map(c => c.toLowerCase()));
    if (childColsObs !== childColsExp) {
      errors.push(`childCols: observed ${childColsObs}, expected ${childColsExp}`);
    }
    const parentColsObs = JSON.stringify(actual.parentCols.map(c => c.toLowerCase()));
    const parentColsExp = JSON.stringify(expected.parentCols.map(c => c.toLowerCase()));
    if (parentColsObs !== parentColsExp) {
      errors.push(`parentCols: observed ${parentColsObs}, expected ${parentColsExp}`);
    }
    if (actual.onUpdate.toUpperCase() !== expected.onUpdate.toUpperCase()) {
      errors.push(`UPDATE_RULE: observed '${actual.onUpdate}', expected '${expected.onUpdate}'`);
    }
    if (actual.onDelete.toUpperCase() !== expected.onDelete.toUpperCase()) {
      errors.push(`DELETE_RULE: observed '${actual.onDelete}', expected '${expected.onDelete}'`);
    }
    return errors;
  }

  // Fail closed on any unexpected incoming FK to normalized parents
  const normalizedParentTables = new Set(['printer_nodes', 'printhouse_machines', 'materials_catalog']);
  const allowedFkNames = new Set([...EXPECTED_FKS.map(fk => fk.name), ...RECOGNIZED_141_FKS.map(fk => fk.name)]);

  for (const [fkName, fkDef] of Object.entries(actualFks)) {
    if (normalizedParentTables.has(fkDef.parentTable)) {
      if (!allowedFkNames.has(fkName)) {
        throw new Error(
          `PRECONDITION FAILED: Unexpected incoming foreign key '${fkName}' on '${fkDef.childTable}' referencing parent '${fkDef.parentTable}'.`
        );
      }
    }
  }

  // Audit any present recognized 141 FK definitions
  const recognized141Errors = [];
  for (const exp141 of RECOGNIZED_141_FKS) {
    if (actualFks[exp141.name]) {
      const defErrors = auditFkDefinition(exp141, actualFks[exp141.name]);
      if (defErrors.length > 0) {
        recognized141Errors.push(`Mismatch on recognized 141 FK '${exp141.name}': ${defErrors.join('; ')}`);
      }
    }
  }
  if (recognized141Errors.length > 0) {
    throw new Error(`PRECONDITION FAILED: Recognized 141 foreign key definition mismatches:\n  ${recognized141Errors.join('\n  ')}`);
  }

  // Retrieve current remediation state
  await connOrDb.query(`
    CREATE TABLE IF NOT EXISTS ppos_remediation_state (
      state_key VARCHAR(100) PRIMARY KEY,
      state_value VARCHAR(100) NOT NULL
    )
  `);
  const [stateRows] = await connOrDb.query(`
    SELECT state_value 
    FROM ppos_remediation_state 
    WHERE state_key = 'remediation_140_status'
  `);
  const remediationStatus = stateRows && stateRows[0] ? stateRows[0].state_value : 'NOT_STARTED';

  if (remediationStatus === 'NOT_STARTED') {
    // Canonical production precondition: all 13 FKs must be present and match exactly
    const presentCount = EXPECTED_FKS.filter(fk => actualFks[fk.name]).length;
    if (presentCount !== EXPECTED_FK_COUNT) {
      const missingNames = EXPECTED_FKS.filter(fk => !actualFks[fk.name]).map(fk => fk.name);
      throw new Error(
        `PRECONDITION FAILED: FK count mismatch in NOT_STARTED state.\n` +
        `  EXPECTED: ${EXPECTED_FK_COUNT} FKs\n` +
        `  OBSERVED: ${presentCount} FKs\n` +
        `  MISSING CONSTRAINTS: [${missingNames.join(', ')}]`
      );
    }

    const fkErrors = [];
    for (const expected of EXPECTED_FKS) {
      const actual = actualFks[expected.name]; // guaranteed present (count verified above)
      const defErrors = auditFkDefinition(expected, actual);
      if (defErrors.length > 0) {
        fkErrors.push(`Mismatch on '${expected.name}': ${defErrors.join('; ')}`);
      }
    }
    if (fkErrors.length > 0) {
      throw new Error(`PRECONDITION FAILED: Foreign key definition mismatches:\n  ${fkErrors.join('\n  ')}`);
    }

    // Set remediation status to IN_PROGRESS before making any mutations
    await connOrDb.query(
      `INSERT INTO ppos_remediation_state (state_key, state_value) VALUES ('remediation_140_status', 'IN_PROGRESS') ON DUPLICATE KEY UPDATE state_value = 'IN_PROGRESS'`
    );

  } else if (remediationStatus === 'IN_PROGRESS') {
    // Idempotent recovery path. Inspect what has already been done.
    const presentFks = EXPECTED_FKS.filter(fk => actualFks[fk.name]);
    const absentFks = EXPECTED_FKS.filter(fk => !actualFks[fk.name]);

    logger.info({
      event: 'migration_remediation_140_recovery',
      message: `Resuming from IN_PROGRESS. Present FKs: ${presentFks.length}/${EXPECTED_FK_COUNT}, absent (already processed): ${absentFks.length}/${EXPECTED_FK_COUNT}.`,
      presentFks: presentFks.map(fk => fk.name),
      absentFks: absentFks.map(fk => fk.name)
    });

    // Verify definition integrity of the FKs still present — corruption here is fatal
    const fkErrors = [];
    for (const expected of presentFks) {
      const actual = actualFks[expected.name];
      const defErrors = auditFkDefinition(expected, actual);
      if (defErrors.length > 0) {
        fkErrors.push(`IN_PROGRESS corruption on '${expected.name}': ${defErrors.join('; ')}`);
      }
    }
    if (fkErrors.length > 0) {
      throw new Error(
        `PRECONDITION FAILED: IN_PROGRESS recovery aborted — unexpected FK definition corruption:\n  ${fkErrors.join('\n  ')}`
      );
    }

  } else {
    // Unknown/unexpected state — hard abort, require manual intervention
    throw new Error(`PRECONDITION FAILED: Database is in an unexpected remediation state: '${remediationStatus}'. Manual intervention required.`);
  }

  // Target column specifications for all 15 tables / 22 columns + printhouse_pricing_rules
  const allTargets = {
    printer_nodes: {
      id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      tenant_id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printhouse_machines: {
      id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      printhouse_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      tenant_id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printhouse_media: {
      printhouse_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      tenant_id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printhouse_policy_profiles: {
      printhouse_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      tenant_id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printhouse_sla_profiles: {
      printhouse_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      tenant_id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    materials_catalog: {
      id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      tenant_id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    job_outcomes: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printer_capacity: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printer_contacts: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printer_machines: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci', preserveWidthIfLarger: true }
    },
    printer_papers: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printer_performance: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printer_service_regions: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printhouse_capabilities: {
      printhouse_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    routing_history: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printhouse_pricing_rules: {
      site_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      machine_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      material_catalog_id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      tenant_id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    }
  };

  // Only drop FKs that are still present (idempotent — safe for IN_PROGRESS retry)
  const activeFksToDrop = [...EXPECTED_FKS, ...RECOGNIZED_141_FKS].filter(fk => actualFks[fk.name]);

  // Set FOREIGN_KEY_CHECKS = 0 strictly for dropping constraints and modifying columns
  await connOrDb.query('SET FOREIGN_KEY_CHECKS = 0');

  try {
    // 4. Drop legacy and recognized 141 FK constraints (only those still present)
    for (const fk of activeFksToDrop) {
      logger.info({ event: 'migration_remediation_140_drop_fk', constraintName: fk.name, table: fk.childTable, message: `Dropping foreign key constraint ${fk.name} on ${fk.childTable}` });
      await connOrDb.query(`ALTER TABLE ${fk.childTable} DROP FOREIGN KEY ${fk.name}`);
    }

    // 5. Widen columns and convert charsets/collations
    for (const [table, columns] of Object.entries(allTargets)) {
      for (const [column, spec] of Object.entries(columns)) {
        const [cols] = await connOrDb.query(`
          SELECT CHARACTER_MAXIMUM_LENGTH, CHARACTER_SET_NAME, COLLATION_NAME, IS_NULLABLE
          FROM information_schema.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
        `, [table, column]);

        if (cols && cols[0]) {
          const current = cols[0];
          let targetLength = spec.length;
          if (spec.preserveWidthIfLarger && current.CHARACTER_MAXIMUM_LENGTH > targetLength) {
            targetLength = current.CHARACTER_MAXIMUM_LENGTH;
          }

          const needsLengthWiden = current.CHARACTER_MAXIMUM_LENGTH < targetLength;
          const needsCharsetConvert = current.CHARACTER_SET_NAME !== spec.charset || current.COLLATION_NAME !== spec.collation;

          if (needsLengthWiden || needsCharsetConvert) {
            const nullability = current.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
            logger.info({
              event: 'migration_remediation_140_exec',
              table,
              column,
              message: `Normalizing ${table}.${column} to VARCHAR(${targetLength}) CHARACTER SET ${spec.charset} COLLATE ${spec.collation} ${nullability} (was VARCHAR(${current.CHARACTER_MAXIMUM_LENGTH}) ${current.CHARACTER_SET_NAME}/${current.COLLATION_NAME})`
            });

            await connOrDb.query(`
              ALTER TABLE ${table} 
              MODIFY COLUMN ${column} VARCHAR(${targetLength}) CHARACTER SET ${spec.charset} COLLATE ${spec.collation} ${nullability}
            `);
          }
        }
      }
    }
  } catch (err) {
    logger.error({ event: 'migration_remediation_140_error', message: `Failure during normalization alters: ${err.message}`, error: err });
    throw err;
  } finally {
    // Re-enable checks immediately before verifying orphans and recreating constraints
    await connOrDb.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  // 6. ORPHAN CHECK BEFORE FK RECREATION
  const orphanErrors = [];
  for (const fk of EXPECTED_FKS) {
    const joinParts = [];
    for (let i = 0; i < fk.childCols.length; i++) {
      joinParts.push(`c.${fk.childCols[i]} = p.${fk.parentCols[i]}`);
    }
    const joinCondition = joinParts.join(' AND ');

    const [orphanRows] = await connOrDb.query(`
      SELECT COUNT(*) as count 
      FROM ${fk.childTable} c 
      LEFT JOIN ${fk.parentTable} p ON ${joinCondition}
      WHERE p.${fk.parentCols[0]} IS NULL
    `);

    const count = orphanRows && orphanRows[0] ? orphanRows[0].count : 0;
    if (count > 0) {
      orphanErrors.push(`Constraint '${fk.name}' on '${fk.childTable}' has ${count} orphan rows referencing '${fk.parentTable}'`);
    }
  }

  // Check orphans for recognized 141 FKs if printhouse_pricing_rules exists
  const [pricingRulesTableCheck] = await connOrDb.query(`
    SELECT TABLE_NAME FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'printhouse_pricing_rules'
  `);
  const pricingRulesExists = pricingRulesTableCheck && pricingRulesTableCheck.length > 0;

  if (pricingRulesExists) {
    for (const fk of RECOGNIZED_141_FKS) {
      const nullableCol = fk.childCols[0]; // site_id, machine_id, material_catalog_id
      const joinParts = [];
      for (let i = 0; i < fk.childCols.length; i++) {
        joinParts.push(`c.${fk.childCols[i]} = p.${fk.parentCols[i]}`);
      }
      const joinCondition = joinParts.join(' AND ');

      const [orphanRows] = await connOrDb.query(`
        SELECT COUNT(*) as count 
        FROM ${fk.childTable} c 
        LEFT JOIN ${fk.parentTable} p ON ${joinCondition}
        WHERE c.${nullableCol} IS NOT NULL AND p.${fk.parentCols[0]} IS NULL
      `);

      const count = orphanRows && orphanRows[0] ? orphanRows[0].count : 0;
      if (count > 0) {
        orphanErrors.push(`Recognized 141 constraint '${fk.name}' on '${fk.childTable}' has ${count} orphan rows referencing '${fk.parentTable}'`);
      }
    }
  }

  if (orphanErrors.length > 0) {
    await connOrDb.query(
      `INSERT INTO ppos_remediation_state (state_key, state_value) VALUES ('remediation_140_status', 'FAILED_ORPHAN') ON DUPLICATE KEY UPDATE state_value = 'FAILED_ORPHAN'`
    );
    throw new Error(`ORPHAN CHECK FAILED: ${orphanErrors.join('; ')}`);
  }

  // 7. FK RECREATION WITH CHECKS ENABLED
  const [fkChecks] = await connOrDb.query('SELECT @@FOREIGN_KEY_CHECKS as fk_checks');
  const activeFkCheckVal = fkChecks && fkChecks[0] ? fkChecks[0].fk_checks : null;
  if (Number(activeFkCheckVal) !== 1) {
    throw new Error(`PRECONDITION FAILED: FOREIGN_KEY_CHECKS must be 1 before FK recreation, observed ${activeFkCheckVal}`);
  }

  const allGovernedFksToRecreate = [...EXPECTED_FKS];
  if (pricingRulesExists) {
    allGovernedFksToRecreate.push(...RECOGNIZED_141_FKS);
  }

  const recreationErrors = [];
  for (const fk of allGovernedFksToRecreate) {
    try {
      const [checkFk] = await connOrDb.query(`
        SELECT CONSTRAINT_NAME 
        FROM information_schema.REFERENTIAL_CONSTRAINTS 
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ?
      `, [fk.name]);

      if (!checkFk || checkFk.length === 0) {
        logger.info({ event: 'migration_remediation_140_recreate_fk', constraintName: fk.name, table: fk.childTable, message: `Recreating foreign key constraint ${fk.name} on ${fk.childTable}` });

        const childColsCsv = fk.childCols.join(', ');
        const parentColsCsv = fk.parentCols.join(', ');

        await connOrDb.query(`
          ALTER TABLE ${fk.childTable} 
          ADD CONSTRAINT ${fk.name} 
          FOREIGN KEY (${childColsCsv}) 
          REFERENCES ${fk.parentTable}(${parentColsCsv}) 
          ON UPDATE ${fk.onUpdate} 
          ON DELETE ${fk.onDelete}
        `);
      }
    } catch (recErr) {
      logger.error({ event: 'migration_remediation_140_recreate_error', constraintName: fk.name, message: `Failed to recreate constraint ${fk.name}: ${recErr.message}`, error: recErr });
      recreationErrors.push(recErr);
    }
  }

  if (recreationErrors.length > 0) {
    throw new Error(`Normalization pre-remediation failed during constraint recreation: ${recreationErrors.map(e => e.message).join('; ')}`);
  }

  // Clean up state table on success
  await connOrDb.query(`DROP TABLE IF EXISTS ppos_remediation_state`);

  logger.info({ event: 'migration_remediation_140_success', message: 'Schema normalization pre-remediation completed (RC7/RC11)' });
}

class MigrationService {
    constructor() {
        this.migrationsPath = path.join(__dirname, '../../../migrations');
        this.baselinePath = path.join(this.migrationsPath, 'migration-integrity-baseline.json');
    }

    /**
     * Run all pending migrations with concurrency locking and preflight safety checks.
     */
    async runMigrations() {
        if (process.env.PPOS_MIGRATION_EXECUTION !== 'true') {
            throw new Error('DDL_EXECUTION_FORBIDDEN_OUTSIDE_MIGRATION_CONTEXT');
        }

        logger.info({ event: 'migration_start', message: 'Starting database migration sequence (Phase 185)' });

        // 1. Preflight local repository check (Verify Phase 183 baseline)
        const integrity = migrationIntegrity.verifyMigrationBaseline(this.migrationsPath, this.baselinePath);
        if (!integrity.ok) {
            const msg = `Local migration integrity compromised: ${integrity.error}`;
            logger.error({ event: 'migration_preflight_failed', reason: integrity.error });
            throw new Error(msg);
        }

        const lockName = 'ppos-control-plane:migrations';
        const lockTimeout = 10; // seconds

        // 2. Acquire a dedicated connection from pool for advisory locking
        const connection = await db.getPool().getConnection();

        try {
            const [lockRows] = await connection.query('SELECT GET_LOCK(?, ?) as is_locked', [lockName, lockTimeout]);
            const lockResult = lockRows ? lockRows[0] : null;
            if (!lockResult || lockResult.is_locked !== 1) {
                const lockMsg = 'Could not acquire database migration lock. Another runner might be active.';
                logger.error({ event: 'migration_lock_failed', lockName });
                throw new Error(lockMsg);
            }


            try {
                // If explicit false-APPLIED 140 repair is requested, execute governed repair
                if (process.env.PPOS_ALLOW_FALSE_APPLIED_140_REPAIR === 'true') {
                    const { repairFalseAppliedMigration140 } = require('./migrationRepairService');
                    await repairFalseAppliedMigration140(connection);
                }

                // Load local migrations to match against database
                const { migrations } = migrationIntegrity.discoverMigrations(this.migrationsPath);
                const baselineData = JSON.parse(fs.readFileSync(this.baselinePath, 'utf8'));

                // 3. Preflight database ledger check
                const ledgerStatus = await ledgerRead.evaluateLedgerStatus(baselineData);

                if (ledgerStatus.status === 'DATABASE_UNREACHABLE') {
                    throw new Error(`Database connection failed: ${ledgerStatus.reason}`);
                }

                if (
                  ledgerStatus.status === 'MIGRATION_FAILED' ||
                  ledgerStatus.status === 'MIGRATION_CHECKSUM_MISMATCH' ||
                  ledgerStatus.status === 'MIGRATION_LEDGER_INCOMPATIBLE' ||
                  ledgerStatus.status === 'MIGRATION_IN_PROGRESS'
                ) {
                    const blockMsg = `Migration blocked due to incompatible/corrupted database state: ${ledgerStatus.reason}`;
                    logger.error({ event: 'migration_preflight_failed', status: ledgerStatus.status, reason: ledgerStatus.reason });
                    throw new Error(blockMsg);
                }

                // If we are ready and no migrations are pending, we are done
                if (ledgerStatus.status === 'READY' && !ledgerStatus.legacy) {
                    logger.info({ event: 'migration_complete', message: 'Database schema is already up to date.' });
                    return { appliedCount: 0, total: migrations.length };
                }

                // 4. Determine pending migrations
                // To be backward compatible, we look up legacy table records as well.
                await ensurePreviousFailuresColumn(connection);

                const applied = await connection.query('SELECT version, description, checksum, state FROM schema_versions');
                const appliedMap = new Map();
                for (const m of applied[0]) {
                    if (m.state === 'FAILED' || m.state === 'STARTED') {
                        continue;
                    }
                    const legacyPath = `migrations/${m.version}.sql`;
                    appliedMap.set(legacyPath, m.checksum);
                    if (m.description) {
                        appliedMap.set(`migrations/${m.description}`, m.checksum);
                    }
                }

                let appliedCount = 0;
                const runnerId = `runner-${process.pid}-${require('os').hostname()}`;

                for (const m of migrations) {
                    const relPath = m.relativePath.replace(/\\/g, '/');

                    if (appliedMap.has(relPath)) {
                        continue; // Already applied
                    }

                    const canonicalHash = migrationIntegrity.calculateFileChecksum(m.absolutePath);
                    const content = fs.readFileSync(m.absolutePath, 'utf8');

                    if (relPath === 'migrations/140_phase191e_materials_capacity_leadtimes.sql') {
                        await runMigration140PreRemediation(connection);
                    }

                    logger.info({ event: 'migration_applying', file: m.filename, path: relPath });

                    const executionId = uuidv4();
                    const parsed = parseMigrationSql(content);
                    const statements = parsed.statements;

                    // Audit check: load current record if it exists to preserve failure evidence
                    let previousFailures = '[]';
                    const [existingRows] = await connection.query(`
                      SELECT execution_id, runner_id, started_at, failed_at, failure_code, failure_message, failed_statement_index, previous_failures
                      FROM schema_versions
                      WHERE migration_path = ?
                    `, [relPath]);

                    if (existingRows && existingRows.length > 0) {
                        const existing = existingRows[0];
                        let history = [];
                        if (existing.previous_failures) {
                            try {
                                history = typeof existing.previous_failures === 'string'
                                    ? JSON.parse(existing.previous_failures)
                                    : existing.previous_failures;
                            } catch (e) {
                                history = [];
                            }
                        }
                        if (existing.execution_id) {
                            history.push({
                                execution_id: existing.execution_id,
                                runner_id: existing.runner_id,
                                started_at: existing.started_at,
                                failed_at: existing.failed_at,
                                failure_code: existing.failure_code,
                                failure_message: existing.failure_message,
                                failed_statement_index: existing.failed_statement_index
                            });
                        }
                        previousFailures = JSON.stringify(history);
                    }

                    // Mark execution as STARTED in ledger (via connection)
                    await connection.query(`
                      INSERT INTO schema_versions (
                        migration_path, version, checksum, state, execution_id, runner_id, repository_commit, started_at, previous_failures
                      ) VALUES (?, ?, ?, 'STARTED', ?, ?, ?, NOW(3), ?)
                      ON DUPLICATE KEY UPDATE
                        state = 'STARTED',
                        execution_id = VALUES(execution_id),
                        runner_id = VALUES(runner_id),
                        repository_commit = VALUES(repository_commit),
                        started_at = NOW(3),
                        failed_at = NULL,
                        failure_code = NULL,
                        failure_message = NULL,
                        previous_failures = VALUES(previous_failures)
                    `, [
                      relPath,
                      m.filename.replace(/\.sql$/, ''),
                      canonicalHash,
                      executionId,
                      runnerId,
                      process.env.DEPLOY_COMMIT || null,
                      previousFailures
                    ]);

                    const startTime = Date.now();
                    let lastSql = '';
                    let lastIndex = 0;

                    try {
                        for (let i = 0; i < statements.length; i++) {
                            const stmt = statements[i];
                            lastSql = stmt.sql;
                            lastIndex = stmt.index;
                            await connection.query(`
                              UPDATE schema_versions
                              SET heartbeat_at = NOW(3)
                              WHERE execution_id = ?
                            `, [executionId]);
                            
                            // Execute statement
                            try {
                                await connection.query(lastSql);
                            } catch (err) {
                                // Idempotency: skip duplicates, table exists, or trigger exists
                                const ignoreCodes = ['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_INDEX', 'ER_TRG_ALREADY_EXISTS'];
                                if (ignoreCodes.includes(err.code) || err.errno === 1060 || err.errno === 1061 || err.errno === 1050 || err.errno === 1359) {
                                    continue;
                                }
                                throw err;
                            }
                        }

                        // Success: mark as APPLIED
                        await connection.query(`
                          UPDATE schema_versions
                          SET 
                            state = 'APPLIED',
                            applied_at = NOW(3),
                            execution_time_ms = ?
                          WHERE execution_id = ?
                        `, [Date.now() - startTime, executionId]);
                        
                        appliedCount++;

                    } catch (err) {
                        // Failure: mark as FAILED with audit-safe metrics
                        const failureCode = err.code || 'MIGRATION_ERROR';
                        const failureMessage = ledgerWrite.sanitizeError(err);
                        const fingerprint = statements[lastIndex - 1] ? statements[lastIndex - 1].fingerprint : ledgerWrite.getStatementFingerprint(lastSql);

                        await connection.query(`
                          UPDATE schema_versions
                          SET 
                            state = 'FAILED',
                            failed_at = NOW(3),
                            execution_time_ms = ?,
                            failure_code = ?,
                            failure_message = ?,
                            failed_statement_index = ?,
                            description = ?
                          WHERE execution_id = ?
                        `, [
                          Date.now() - startTime,
                          failureCode,
                          failureMessage,
                          lastIndex,
                          `SQL Fingerprint: ${fingerprint}`,
                          executionId
                        ]);
                        throw err;
                    }
                }

                logger.info({ 
                    event: 'migration_complete', 
                    message: `Migration sequence finished successfully. Applied ${appliedCount} new migrations.`
                });

                return { appliedCount, total: migrations.length };

            } finally {
                // 5. Always release database advisory lock
                await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
            }
        } finally {
            // Release connection back to pool
            connection.release();
        }
    }


    /**
     * Fail-fast schema validation.
     */
    async validateSchema() {
        try {
            const [rows] = await db.query('SELECT COUNT(*) as count FROM schema_versions');
            if (!rows || rows.count === 0) {
                throw new Error('Schema version tracking missing or empty.');
            }
            return true;
        } catch (err) {
            logger.warn({ event: 'schema_validation_failed', message: err.message });
            return false;
        }
    }
}

const migrationService = new MigrationService();

module.exports = {
    MigrationService,
    migrationService,
    runMigration140PreRemediation
};
