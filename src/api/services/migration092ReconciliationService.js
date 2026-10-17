'use strict';

/**
 * src/api/services/migration092ReconciliationService.js
 *
 * Phase CI-02I: Governed additive schema reconciliation for migration 092.
 * Reconciles Phase 139 (migration 087) layout with Phase 144 (migration 092/093) expectations
 * on the controlled_beta_cohort_intervention_approvals table.
 *
 * Security & Governance Invariants:
 * - Operates ONLY under PPOS_MIGRATION_EXECUTION='true'
 * - Preserves ALL columns, types (JSON/DATETIME), and records from 087
 * - Strictly additive: only missing Phase 144 columns are added
 * - Validates existing columns against type/incompatibility rules
 * - Invariant restrictive defaults for governance columns (PENDING, NOT_ELIGIBLE, etc.)
 * - 100% idempotent and safe under repeated execution
 */

const logger = require('./logger').child('migration-092-reconciliation');

// Exact Phase 144 supplementary column definitions with strict restrictive governance defaults
const RECONCILIATION_COLUMNS = Object.freeze([
  {
    name: 'source_prep_id',
    definition: 'VARCHAR(64) NULL',
    expectedDataType: 'varchar',
    minCharacterLength: 64,
    allowNullable: true,
    expectedDefault: null
  },
  {
    name: 'source_simulation_id',
    definition: 'VARCHAR(64) NULL',
    expectedDataType: 'varchar',
    minCharacterLength: 64,
    allowNullable: true,
    expectedDefault: null
  },
  {
    name: 'source_execution_id',
    definition: 'VARCHAR(64) NULL',
    expectedDataType: 'varchar',
    minCharacterLength: 64,
    allowNullable: true,
    expectedDefault: null
  },
  {
    name: 'simulation_type',
    definition: 'VARCHAR(64) NULL',
    expectedDataType: 'varchar',
    minCharacterLength: 64,
    allowNullable: true,
    expectedDefault: null
  },
  {
    name: 'projected_impact_score',
    definition: 'INT NULL',
    expectedDataType: 'int',
    allowNullable: true,
    expectedDefault: null
  },
  {
    name: 'rollback_feasibility_score',
    definition: 'INT NULL',
    expectedDataType: 'int',
    allowNullable: true,
    expectedDefault: null
  },
  {
    name: 'evidence_completeness_score',
    definition: 'INT NULL',
    expectedDataType: 'int',
    allowNullable: true,
    expectedDefault: null
  },
  {
    name: 'guardrail_status',
    definition: "VARCHAR(32) NOT NULL DEFAULT 'PENDING'",
    expectedDataType: 'varchar',
    minCharacterLength: 32,
    allowNullable: false,
    expectedDefault: 'PENDING'
  },
  {
    name: 'write_scope_status',
    definition: "VARCHAR(32) NOT NULL DEFAULT 'PENDING'",
    expectedDataType: 'varchar',
    minCharacterLength: 32,
    allowNullable: false,
    expectedDefault: 'PENDING'
  },
  {
    name: 'write_scope_attestation_json',
    definition: 'TEXT NULL',
    expectedDataType: 'text',
    alternateDataType: 'json',
    allowNullable: true,
    expectedDefault: null
  },
  {
    name: 'approval_readiness_json',
    definition: 'TEXT NULL',
    expectedDataType: 'text',
    alternateDataType: 'json',
    allowNullable: true,
    expectedDefault: null
  },
  {
    name: 'source_prep_hash',
    definition: 'VARCHAR(128) NULL',
    expectedDataType: 'varchar',
    minCharacterLength: 128,
    allowNullable: true,
    expectedDefault: null
  },
  {
    name: 'source_prep_evidence_pack_hash',
    definition: 'VARCHAR(128) NULL',
    expectedDataType: 'varchar',
    minCharacterLength: 128,
    allowNullable: true,
    expectedDefault: null
  },
  {
    name: 'execution_capability_status',
    definition: "VARCHAR(64) NOT NULL DEFAULT 'EXECUTION_NOT_ENABLED'",
    expectedDataType: 'varchar',
    minCharacterLength: 64,
    allowNullable: false,
    expectedDefault: 'EXECUTION_NOT_ENABLED'
  },
  {
    name: 'approval_execution_status',
    definition: "VARCHAR(64) NOT NULL DEFAULT 'NOT_APPROVED_NOT_EXECUTED'",
    expectedDataType: 'varchar',
    minCharacterLength: 64,
    allowNullable: false,
    expectedDefault: 'NOT_APPROVED_NOT_EXECUTED'
  },
  {
    name: 'future_execution_eligibility_status',
    definition: "VARCHAR(128) NOT NULL DEFAULT 'NOT_ELIGIBLE'",
    expectedDataType: 'varchar',
    minCharacterLength: 128,
    allowNullable: false,
    expectedDefault: 'NOT_ELIGIBLE'
  }
]);

// Obligatory core columns that must exist from Phase 139 (migration 087)
const REQUIRED_087_COLUMNS = Object.freeze([
  'approval_id',
  'source_preparation_id',
  'source_review_id',
  'cohort_id',
  'tenant_id',
  'approval_status'
]);

/**
 * Validates whether an existing column definition is compatible with the 092 specification.
 * Checks data type, character length (if applicable), nullability, and default value.
 */
function assertColumnCompatibility(tableName, existing, colDef) {
  const actualType = String(existing.DATA_TYPE || '').toLowerCase();
  const isTypeMatch = actualType === colDef.expectedDataType ||
    (colDef.alternateDataType && actualType === colDef.alternateDataType);

  if (!isTypeMatch) {
    throw new Error(
      `INCOMPATIBLE_COLUMN_DEFINITION: Column '${colDef.name}' in table '${tableName}' has data type '${actualType}', expected '${colDef.expectedDataType}'`
    );
  }

  if (colDef.minCharacterLength && existing.CHARACTER_MAXIMUM_LENGTH) {
    const actualLen = Number(existing.CHARACTER_MAXIMUM_LENGTH);
    if (actualLen < colDef.minCharacterLength) {
      throw new Error(
        `INCOMPATIBLE_COLUMN_DEFINITION: Column '${colDef.name}' in table '${tableName}' has length ${actualLen}, expected at least ${colDef.minCharacterLength}`
      );
    }
  }

  if (colDef.allowNullable === false) {
    const isNullable = String(existing.IS_NULLABLE || '').toUpperCase() === 'YES';
    if (isNullable) {
      throw new Error(
        `INCOMPATIBLE_COLUMN_DEFINITION: Column '${colDef.name}' in table '${tableName}' is NULLABLE, expected NOT NULL`
      );
    }

    if (colDef.expectedDefault !== undefined && colDef.expectedDefault !== null) {
      const rawDefault = existing.COLUMN_DEFAULT !== null && existing.COLUMN_DEFAULT !== undefined
        ? String(existing.COLUMN_DEFAULT).replace(/^'|'$/g, '')
        : null;
      if (rawDefault !== colDef.expectedDefault) {
        throw new Error(
          `INCOMPATIBLE_COLUMN_DEFINITION: Column '${colDef.name}' in table '${tableName}' has default '${rawDefault}', expected '${colDef.expectedDefault}'`
        );
      }
    }
  }
}

/**
 * Runs governed additive reconciliation on controlled_beta_cohort_intervention_approvals
 * right before migration 092 execution.
 *
 * @param {object} connOrDb - Active MySQL connection or pool
 */
async function runMigration092PreRemediation(connOrDb) {
  if (process.env.PPOS_MIGRATION_EXECUTION !== 'true') {
    throw new Error('DDL_EXECUTION_FORBIDDEN_OUTSIDE_MIGRATION_CONTEXT');
  }

  logger.info({
    event: 'migration_remediation_092_start',
    message: 'Evaluating governed additive schema reconciliation for migration 092'
  });

  const tableName = 'controlled_beta_cohort_intervention_approvals';

  // 1. Verify that the table exists
  const [tableRows] = await connOrDb.query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
  `, [tableName]);

  if (!tableRows || tableRows.length === 0) {
    logger.info({
      event: 'migration_remediation_092_table_not_present',
      message: `${tableName} does not exist yet; skipping pre-remediation (migration 092 will create it).`
    });
    return;
  }

  // Helper to inspect columns
  async function fetchExistingColumns() {
    const [colRows] = await connOrDb.query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    `, [tableName]);

    const map = new Map();
    for (const c of colRows) {
      map.set(c.COLUMN_NAME, c);
    }
    return map;
  }

  // 2. Inspect existing columns and data types
  let existingColumnsMap = await fetchExistingColumns();

  // 3. Validate mandatory Phase 139 (087) baseline columns
  const missingCoreColumns = REQUIRED_087_COLUMNS.filter(name => !existingColumnsMap.has(name));
  if (missingCoreColumns.length > 0) {
    throw new Error(
      `PRECONDITION_FAILED: Table ${tableName} exists but is missing mandatory Phase 139 columns: [${missingCoreColumns.join(', ')}]`
    );
  }

  // 4. Validate compatibility of already existing columns against 092 contract
  for (const colDef of RECONCILIATION_COLUMNS) {
    if (existingColumnsMap.has(colDef.name)) {
      assertColumnCompatibility(tableName, existingColumnsMap.get(colDef.name), colDef);
    }
  }

  // 5. Add missing columns additively
  for (const colDef of RECONCILIATION_COLUMNS) {
    if (!existingColumnsMap.has(colDef.name)) {
      logger.info({
        event: 'migration_remediation_092_adding_column',
        table: tableName,
        column: colDef.name,
        definition: colDef.definition
      });

      try {
        await connOrDb.query(`ALTER TABLE ${tableName} ADD COLUMN ${colDef.name} ${colDef.definition}`);
      } catch (err) {
        // If another process concurrently added it, re-read INFORMATION_SCHEMA and verify compatibility
        if (err.code === 'ER_DUP_FIELDNAME' || err.errno === 1060) {
          const reloadedMap = await fetchExistingColumns();
          if (reloadedMap.has(colDef.name)) {
            assertColumnCompatibility(tableName, reloadedMap.get(colDef.name), colDef);
            continue;
          }
        }
        throw err;
      }
    }
  }

  logger.info({
    event: 'migration_remediation_092_complete',
    message: `Governed additive schema reconciliation for ${tableName} completed successfully.`
  });
}

module.exports = {
  RECONCILIATION_COLUMNS,
  REQUIRED_087_COLUMNS,
  runMigration092PreRemediation
};
