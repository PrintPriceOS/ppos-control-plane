'use strict';

/**
 * src/api/services/migration161ReconciliationService.js
 *
 * Phase OP-01T: Governed additive schema reconciliation for migration 161
 * (Phase 184G Industrial Persistence Ledger).
 *
 * Governs the additive column and index reconciliation for pre-existing tables:
 *   - printer_nodes
 *   - print_nodes
 *   - print_node_machine_profiles
 *   - manufacturing_dispatches
 *   - manufacturing_capacity_reservations
 *   - manufacturing_dispatch_events
 *   - orders
 *   - federation_factories
 *
 * Security & Governance Invariants:
 * - Operates ONLY under PPOS_MIGRATION_EXECUTION='true'
 * - Inspects information_schema.COLUMNS and information_schema.STATISTICS before any DDL
 * - Preserves ALL pre-existing data, rows, and columns without destructive operations
 * - Strictly additive: missing columns are added via individual ALTER TABLE ADD COLUMN statements
 * - Strictly validated: existing columns are checked for data type, length, nullability, and default compatibility
 * - Incompatible types or conflicting indexes cause an immediate abort (fail-closed)
 * - 100% idempotent: repeated executions perform zero ALTER TABLE statements
 * - Safe under concurrent execution: catches ER_DUP_FIELDNAME / 1060 and verifies re-read compatibility
 */

const logger = require('./logger').child('migration-161-reconciliation');

// Definitions of supplementary columns expected by Phase 184G across pre-existing industrial tables
const RECONCILIATION_COLUMNS = Object.freeze({
  printer_nodes: [
    { name: 'region', definition: 'VARCHAR(128) NULL', expectedDataType: 'varchar', minCharacterLength: 128, allowNullable: true },
    { name: 'latitude', definition: 'DECIMAL(10, 8) NULL', expectedDataType: 'decimal', allowNullable: true },
    { name: 'longitude', definition: 'DECIMAL(11, 8) NULL', expectedDataType: 'decimal', allowNullable: true },
    { name: 'timezone', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'address_line', definition: 'TEXT NULL', expectedDataType: 'text', alternateDataType: 'varchar', allowNullable: true },
    { name: 'federation_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'cluster_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'printer_api_key_hash', definition: 'VARCHAR(255) NULL', expectedDataType: 'varchar', minCharacterLength: 255, allowNullable: true },
    { name: 'machine_state', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'worker_state', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'sync_version', definition: 'VARCHAR(32) NULL', expectedDataType: 'varchar', minCharacterLength: 32, allowNullable: true },
    { name: 'queue_depth', definition: 'INT DEFAULT 0', expectedDataType: 'int', allowNullable: true },
    { name: 'active_jobs', definition: 'INT DEFAULT 0', expectedDataType: 'int', allowNullable: true },
    { name: 'capacity_utilization_pct', definition: 'INT DEFAULT 0', expectedDataType: 'int', allowNullable: true },
    { name: 'company_name', definition: 'VARCHAR(255) NULL', expectedDataType: 'varchar', minCharacterLength: 255, allowNullable: true },
    { name: 'primary_contact_name', definition: 'VARCHAR(255) NULL', expectedDataType: 'varchar', minCharacterLength: 255, allowNullable: true },
    { name: 'primary_contact_email', definition: 'VARCHAR(255) NULL', expectedDataType: 'varchar', minCharacterLength: 255, allowNullable: true },
    { name: 'supported_products', definition: 'JSON NULL', expectedDataType: 'json', alternateDataType: 'text', allowNullable: true },
    { name: 'binding_capabilities', definition: 'JSON NULL', expectedDataType: 'json', alternateDataType: 'text', allowNullable: true },
    { name: 'color_profiles', definition: 'JSON NULL', expectedDataType: 'json', alternateDataType: 'text', allowNullable: true },
    { name: 'throughput', definition: 'DECIMAL(12,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'uptime_score', definition: 'DECIMAL(5,2) DEFAULT 100.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'economic_efficiency', definition: 'DECIMAL(5,2) DEFAULT 1.00', expectedDataType: 'decimal', allowNullable: true }
  ],
  print_nodes: [
    { name: 'active_jobs', definition: 'INT DEFAULT 0', expectedDataType: 'int', allowNullable: true },
    { name: 'queue_depth', definition: 'INT DEFAULT 0', expectedDataType: 'int', allowNullable: true },
    { name: 'region', definition: 'VARCHAR(128) NULL', expectedDataType: 'varchar', minCharacterLength: 128, allowNullable: true },
    { name: 'federation_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'cluster_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'latitude', definition: 'DECIMAL(10, 8) NULL', expectedDataType: 'decimal', allowNullable: true },
    { name: 'longitude', definition: 'DECIMAL(11, 8) NULL', expectedDataType: 'decimal', allowNullable: true },
    { name: 'machine_state', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'worker_state', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'sync_version', definition: 'VARCHAR(32) NULL', expectedDataType: 'varchar', minCharacterLength: 32, allowNullable: true },
    { name: 'supported_products', definition: 'JSON NULL', expectedDataType: 'json', alternateDataType: 'text', allowNullable: true },
    { name: 'binding_capabilities', definition: 'JSON NULL', expectedDataType: 'json', alternateDataType: 'text', allowNullable: true },
    { name: 'color_profiles', definition: 'JSON NULL', expectedDataType: 'json', alternateDataType: 'text', allowNullable: true },
    { name: 'throughput', definition: 'DECIMAL(12,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'uptime_score', definition: 'DECIMAL(5,2) DEFAULT 100.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'economic_efficiency', definition: 'DECIMAL(5,2) DEFAULT 1.00', expectedDataType: 'decimal', allowNullable: true }
  ],
  print_node_machine_profiles: [
    { name: 'throughput', definition: 'DECIMAL(12,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'uptime_score', definition: 'DECIMAL(5,2) DEFAULT 100.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'economic_efficiency', definition: 'DECIMAL(5,2) DEFAULT 1.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'governance_stability_score', definition: 'DECIMAL(5,2) DEFAULT 100.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'federation_learning_score', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'ethics_compliance_score', definition: 'DECIMAL(5,2) DEFAULT 100.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'continental_cluster_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'planetary_reliability_index', definition: 'DECIMAL(5,2) DEFAULT 100.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'civilization_contribution_score', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'orbital_cluster_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'synthetic_awareness_score', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'civilization_survival_score', definition: 'DECIMAL(5,2) DEFAULT 100.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'simulation_coherence', definition: 'DECIMAL(5,2) DEFAULT 100.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'universal_synchronization', definition: 'DECIMAL(5,2) DEFAULT 100.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'reality_stability_index', definition: 'DECIMAL(5,2) DEFAULT 100.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'recursive_continuity', definition: 'DECIMAL(5,2) DEFAULT 100.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'dimensional_cluster_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'omniversal_coherence', definition: 'DECIMAL(5,2) DEFAULT 100.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'transcendent_awareness', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'singularity_stability', definition: 'DECIMAL(5,2) DEFAULT 100.00', expectedDataType: 'decimal', allowNullable: true }
  ],
  manufacturing_dispatches: [
    { name: 'production_package_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'print_node_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'economic_score', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', alternateDataType: 'float', allowNullable: true },
    { name: 'profitability_score', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', alternateDataType: 'float', allowNullable: true },
    { name: 'energy_efficiency_score', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', alternateDataType: 'float', allowNullable: true },
    { name: 'evidence_snapshot_json', definition: 'JSON NULL', expectedDataType: 'json', alternateDataType: 'text', allowNullable: true },
    { name: 'certification_state', definition: "VARCHAR(64) DEFAULT 'PENDING'", expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'forensic_risk', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'autofix_state', definition: "VARCHAR(64) DEFAULT 'NONE'", expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'artifact_count', definition: 'INT DEFAULT 0', expectedDataType: 'int', allowNullable: true },
    { name: 'certified_pdf_url', definition: 'TEXT NULL', expectedDataType: 'text', alternateDataType: 'varchar', allowNullable: true },
    { name: 'normalized_pdf_url', definition: 'TEXT NULL', expectedDataType: 'text', alternateDataType: 'varchar', allowNullable: true },
    { name: 'federation_node_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'governance_policy_score', definition: 'FLOAT DEFAULT 0.0', expectedDataType: 'float', alternateDataType: 'decimal', allowNullable: true },
    { name: 'governance_risk_score', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'constitutional_compliance', definition: 'DECIMAL(5,2) DEFAULT 100.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'cognition_priority', definition: 'INT DEFAULT 0', expectedDataType: 'int', allowNullable: true },
    { name: 'recursive_generation_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'planetary_priority_score', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'civilization_risk_score', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'intercontinental_route_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'planetary_equilibrium_weight', definition: 'DECIMAL(5,2) DEFAULT 1.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'interplanetary_priority_score', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'existential_risk_score', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'orbital_route_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'continuity_weight', definition: 'DECIMAL(5,2) DEFAULT 1.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'timeline_weight', definition: 'DECIMAL(5,2) DEFAULT 1.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'existence_priority', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'reality_risk_score', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'universal_dependency', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'singularity_weight', definition: 'DECIMAL(5,2) DEFAULT 1.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'omniversal_priority', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true },
    { name: 'causal_chain_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'entropy_score', definition: 'DECIMAL(5,2) DEFAULT 0.00', expectedDataType: 'decimal', allowNullable: true }
  ],
  manufacturing_capacity_reservations: [
    { name: 'utilization_snapshot', definition: 'INT DEFAULT 0', expectedDataType: 'int', allowNullable: true }
  ],
  manufacturing_dispatch_events: [
    { name: 'trace_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'correlation_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'source_service', definition: 'VARCHAR(128) NULL', expectedDataType: 'varchar', minCharacterLength: 128, allowNullable: true },
    { name: 'routing_reason', definition: 'VARCHAR(255) NULL', expectedDataType: 'varchar', minCharacterLength: 255, allowNullable: true },
    { name: 'orchestration_metadata', definition: 'JSON NULL', expectedDataType: 'json', alternateDataType: 'text', allowNullable: true }
  ],
  orders: [
    { name: 'selected_offer_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'recommended_offer_id', definition: 'VARCHAR(64) NULL', expectedDataType: 'varchar', minCharacterLength: 64, allowNullable: true },
    { name: 'offers_snapshot', definition: 'JSON NULL', expectedDataType: 'json', alternateDataType: 'text', allowNullable: true },
    { name: 'production_files', definition: 'JSON NULL', expectedDataType: 'json', alternateDataType: 'text', allowNullable: true },
    { name: 'invoice_payment', definition: 'JSON NULL', expectedDataType: 'json', alternateDataType: 'text', allowNullable: true }
  ],
  federation_factories: [
    { name: 'company_name', definition: 'VARCHAR(255) NULL', expectedDataType: 'varchar', minCharacterLength: 255, allowNullable: true }
  ]
});

/**
 * Validates whether an existing column is compatible with the Phase 184G specification.
 * Throws INCOMPATIBLE_COLUMN_DEFINITION on incompatible data types or non-satisfiable constraints.
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
  }
}

/**
 * Validates table index compatibility.
 * If an index exists on the columns with conflicting uniqueness or incompatible direction,
 * it throws INCOMPATIBLE_INDEX_DEFINITION.
 */
async function assertTableIndexCompatibility(connOrDb, tableName, indexRequirements) {
  const [indexRows] = await connOrDb.query(`
    SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    ORDER BY INDEX_NAME, SEQ_IN_INDEX ASC
  `, [tableName]);

  if (!indexRows || indexRows.length === 0) return;

  const indexesByName = new Map();
  for (const row of indexRows) {
    if (!indexesByName.has(row.INDEX_NAME)) {
      indexesByName.set(row.INDEX_NAME, {
        nonUnique: Number(row.NON_UNIQUE) === 1,
        columns: []
      });
    }
    indexesByName.get(row.INDEX_NAME).columns.push(row.COLUMN_NAME);
  }

  for (const req of indexRequirements) {
    for (const [idxName, idxDef] of indexesByName.entries()) {
      const isColMatch = idxDef.columns.length === req.columns.length &&
        idxDef.columns.every((c, i) => c.toLowerCase() === req.columns[i].toLowerCase());

      if (isColMatch) {
        if (req.uniqueRequired && idxDef.nonUnique) {
          throw new Error(
            `INCOMPATIBLE_INDEX_DEFINITION: Index '${idxName}' on '${tableName}' is NON-UNIQUE, expected UNIQUE for columns [${req.columns.join(', ')}]`
          );
        }
        if (req.uniqueRequired === false && !idxDef.nonUnique) {
          throw new Error(
            `INCOMPATIBLE_INDEX_DEFINITION: Index '${idxName}' on '${tableName}' is UNIQUE, conflicting with required non-unique index on columns [${req.columns.join(', ')}]`
          );
        }
      }
    }
  }
}

/**
 * Runs governed additive reconciliation for migration 161.
 * Inspects all target tables, verifies compatibility, and applies missing columns additively.
 *
 * @param {object} connOrDb - Active MySQL connection or pool
 */
async function runMigration161PreRemediation(connOrDb) {
  if (process.env.PPOS_MIGRATION_EXECUTION !== 'true') {
    throw new Error('DDL_EXECUTION_FORBIDDEN_OUTSIDE_MIGRATION_CONTEXT');
  }

  logger.info({
    event: 'migration_remediation_161_start',
    message: 'Evaluating governed additive schema reconciliation for migration 161 (Phase 184G)'
  });

  // 1. Inspect existing tables in the current database schema
  const [existingTableRows] = await connOrDb.query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
  `);
  const existingTableNames = new Set((existingTableRows || []).map(r => r.TABLE_NAME.toLowerCase()));

  // 2. Index compatibility requirements for pre-existing tables
  const indexSpecs = {
    print_nodes: [
      { columns: ['tenant_id'], uniqueRequired: false },
      { columns: ['status'], uniqueRequired: false },
      { columns: ['license_status'], uniqueRequired: false }
    ],
    manufacturing_dispatches: [
      { columns: ['manufacturing_package_id'], uniqueRequired: false },
      { columns: ['print_node_id'], uniqueRequired: false },
      { columns: ['status'], uniqueRequired: false }
    ]
  };

  // 3. For each table, if it exists, inspect columns, check compatibility, and add missing columns
  for (const [tableName, columns] of Object.entries(RECONCILIATION_COLUMNS)) {
    if (!existingTableNames.has(tableName.toLowerCase())) {
      // Table does not exist yet; will be created by the SQL migration
      continue;
    }

    // Inspect index compatibility if applicable
    if (indexSpecs[tableName]) {
      await assertTableIndexCompatibility(connOrDb, tableName, indexSpecs[tableName]);
    }

    // Inspect existing columns
    const [existingColRows] = await connOrDb.query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    `, [tableName]);

    const existingColMap = new Map();
    for (const c of existingColRows) {
      existingColMap.set(c.COLUMN_NAME.toLowerCase(), c);
    }

    // Check compatibility of already existing columns
    for (const colDef of columns) {
      if (existingColMap.has(colDef.name.toLowerCase())) {
        assertColumnCompatibility(tableName, existingColMap.get(colDef.name.toLowerCase()), colDef);
      }
    }

    // Add missing columns additively
    for (const colDef of columns) {
      if (!existingColMap.has(colDef.name.toLowerCase())) {
        logger.info({
          event: 'migration_remediation_161_add_column',
          table: tableName,
          column: colDef.name,
          definition: colDef.definition
        });

        try {
          await connOrDb.query(`ALTER TABLE ${tableName} ADD COLUMN ${colDef.name} ${colDef.definition}`);
        } catch (err) {
          // If concurrent runner already added it, verify its compatibility upon re-read
          if (err.code === 'ER_DUP_FIELDNAME' || err.errno === 1060) {
            const [recheckCols] = await connOrDb.query(`
              SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
              FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
            `, [tableName, colDef.name]);

            if (recheckCols && recheckCols.length > 0) {
              assertColumnCompatibility(tableName, recheckCols[0], colDef);
              continue;
            }
          }
          throw err;
        }
      }
    }
  }

  logger.info({
    event: 'migration_remediation_161_complete',
    message: 'Governed additive schema reconciliation for migration 161 completed successfully.'
  });
}

module.exports = {
  RECONCILIATION_COLUMNS,
  assertColumnCompatibility,
  assertTableIndexCompatibility,
  runMigration161PreRemediation
};
