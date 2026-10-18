import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
const {
  RECONCILIATION_COLUMNS,
  assertColumnCompatibility,
  assertTableIndexCompatibility,
  runMigration161PreRemediation,
  validateMigration161PostConditions
} = require('../src/api/services/migration161ReconciliationService');
const { runMigration161PreRemediation: exportedFromMigrationService } = require('../src/api/services/migrationService');

describe('OP-01T: Migration 161 Governed Industrial Persistence Suite', () => {
  const originalEnv = process.env.PPOS_MIGRATION_EXECUTION;

  beforeEach(() => {
    process.env.PPOS_MIGRATION_EXECUTION = 'true';
  });

  afterEach(() => {
    process.env.PPOS_MIGRATION_EXECUTION = originalEnv;
  });

  // 1. Module export parity
  it('1. Verifies that the exported function from migrationService matches real module', () => {
    expect(typeof exportedFromMigrationService).toBe('function');
    expect(exportedFromMigrationService).toBe(runMigration161PreRemediation);
  });

  // 2. Security invariant: fails outside migration context
  it('2. Prohibits execution outside authorized migration context', async () => {
    process.env.PPOS_MIGRATION_EXECUTION = 'false';
    const mockConn = { query: vi.fn() };

    await expect(runMigration161PreRemediation(mockConn))
      .rejects
      .toThrow('DDL_EXECUTION_FORBIDDEN_OUTSIDE_MIGRATION_CONTEXT');

    expect(mockConn.query).not.toHaveBeenCalled();
  });

  // 3. Clean database scenario (A): none of the tables exist yet -> 0 alters
  it('3. Skips gracefully when tables do not exist yet (clean slate)', async () => {
    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[]]; // No tables exist
        }
        return [[]];
      })
    };

    await expect(runMigration161PreRemediation(mockConn)).resolves.toBeUndefined();
    // Only 1 query to inspect INFORMATION_SCHEMA.TABLES
    expect(mockConn.query).toHaveBeenCalledTimes(1);
  });

  // 4. Upgrading from historical baseline / partially provisioned (D): adds missing columns additively
  it('4. Reconciles partially provisioned tables by adding only missing columns', async () => {
    // printer_nodes exists with baseline columns but lacks telemetry/geolocation columns
    const baselinePrinterCols = [
      { COLUMN_NAME: 'id', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 64, IS_NULLABLE: 'NO', COLUMN_DEFAULT: null },
      { COLUMN_NAME: 'tenant_id', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 64, IS_NULLABLE: 'NO', COLUMN_DEFAULT: null },
      { COLUMN_NAME: 'name', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 255, IS_NULLABLE: 'NO', COLUMN_DEFAULT: null }
    ];

    const executedAlterStmts = [];
    const mockConn = {
      query: vi.fn(async (q, params) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[{ TABLE_NAME: 'printer_nodes' }]];
        }
        if (q.includes('INFORMATION_SCHEMA.STATISTICS')) {
          return [[]]; // No conflicting indexes
        }
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) {
          return [baselinePrinterCols];
        }
        if (q.startsWith('ALTER TABLE')) {
          executedAlterStmts.push(q);
          return [{ affectedRows: 0 }];
        }
        return [[]];
      })
    };

    await runMigration161PreRemediation(mockConn);

    // All printer_nodes supplementary columns should be added
    expect(executedAlterStmts.length).toBe(RECONCILIATION_COLUMNS.printer_nodes.length);
    const allAlters = executedAlterStmts.join('\n');
    expect(allAlters).toContain('ADD COLUMN region VARCHAR(128) NULL');
    expect(allAlters).toContain('ADD COLUMN latitude DECIMAL(10, 8) NULL');
    expect(allAlters).toContain('ADD COLUMN longitude DECIMAL(11, 8) NULL');
    expect(allAlters).toContain('ADD COLUMN machine_state VARCHAR(64) NULL');
    expect(allAlters).toContain('ADD COLUMN sync_version VARCHAR(32) NULL');
  });

  // 5. Fully compatible pre-existing schema (C) / Second execution (J): 0 ALTER TABLE statements
  it('5. Operates 100% idempotently when all columns already exist (zero DDL executed)', async () => {
    const fullPrinterCols = [
      { COLUMN_NAME: 'id', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 64, IS_NULLABLE: 'NO', COLUMN_DEFAULT: null },
      ...RECONCILIATION_COLUMNS.printer_nodes.map(c => ({
        COLUMN_NAME: c.name,
        DATA_TYPE: c.expectedDataType,
        CHARACTER_MAXIMUM_LENGTH: c.minCharacterLength || null,
        IS_NULLABLE: c.allowNullable ? 'YES' : 'NO',
        COLUMN_DEFAULT: c.expectedDefault || null
      }))
    ];

    let alterCount = 0;
    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[{ TABLE_NAME: 'printer_nodes' }]];
        }
        if (q.includes('INFORMATION_SCHEMA.STATISTICS')) {
          return [[]];
        }
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) {
          return [fullPrinterCols];
        }
        if (q.startsWith('ALTER TABLE')) {
          alterCount++;
          return [{ affectedRows: 0 }];
        }
        return [[]];
      })
    };

    await runMigration161PreRemediation(mockConn);
    expect(alterCount).toBe(0);
  });

  // 6. Incompatible column type (E): fails closed immediately
  it('6. Rejects and aborts when an existing column has an incompatible data type', async () => {
    // latitude exists as VARCHAR instead of DECIMAL
    const badTypeCols = [
      { COLUMN_NAME: 'id', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 64, IS_NULLABLE: 'NO', COLUMN_DEFAULT: null },
      { COLUMN_NAME: 'latitude', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 64, IS_NULLABLE: 'YES', COLUMN_DEFAULT: null }
    ];

    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[{ TABLE_NAME: 'printer_nodes' }]];
        }
        if (q.includes('INFORMATION_SCHEMA.STATISTICS')) {
          return [[]];
        }
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) {
          return [badTypeCols];
        }
        return [[]];
      })
    };

    await expect(runMigration161PreRemediation(mockConn))
      .rejects
      .toThrow("INCOMPATIBLE_COLUMN_DEFINITION: Column 'latitude' in table 'printer_nodes' has data type 'varchar', expected 'decimal'");
  });

  // 7. Incompatible column length (E2): fails closed
  it('7. Rejects and aborts when an existing column is shorter than required contract', async () => {
    // region exists as VARCHAR(32) instead of at least VARCHAR(128)
    const shortRegionCols = [
      { COLUMN_NAME: 'id', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 64, IS_NULLABLE: 'NO', COLUMN_DEFAULT: null },
      { COLUMN_NAME: 'region', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 32, IS_NULLABLE: 'YES', COLUMN_DEFAULT: null }
    ];

    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[{ TABLE_NAME: 'printer_nodes' }]];
        }
        if (q.includes('INFORMATION_SCHEMA.STATISTICS')) {
          return [[]];
        }
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) {
          return [shortRegionCols];
        }
        return [[]];
      })
    };

    await expect(runMigration161PreRemediation(mockConn))
      .rejects
      .toThrow("INCOMPATIBLE_COLUMN_DEFINITION: Column 'region' in table 'printer_nodes' has length 32, expected at least 128");
  });

  // 8. Incompatible index definition (F): fails closed
  it('8. Rejects and aborts when an index has conflicting uniqueness constraints', async () => {
    // print_nodes has an unexpected UNIQUE index on tenant_id
    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[{ TABLE_NAME: 'print_nodes' }]];
        }
        if (q.includes('INFORMATION_SCHEMA.STATISTICS')) {
          return [[
            { INDEX_NAME: 'idx_tenant_unique', COLUMN_NAME: 'tenant_id', NON_UNIQUE: 0, SEQ_IN_INDEX: 1 }
          ]];
        }
        return [[]];
      })
    };

    await expect(runMigration161PreRemediation(mockConn))
      .rejects
      .toThrow("INCOMPATIBLE_INDEX_DEFINITION: Index 'idx_tenant_unique' on 'print_nodes' is UNIQUE, conflicting with required non-unique index");
  });

  // 9. Concurrent runner scenario (I): catches ER_DUP_FIELDNAME (1060) and validates compatibility upon re-read
  it('9. Recovers gracefully if a concurrent runner added the column, verifying re-read compatibility', async () => {
    const initialCols = [
      { COLUMN_NAME: 'id', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 64, IS_NULLABLE: 'NO', COLUMN_DEFAULT: null }
    ];

    let alterAttempted = false;
    const mockConn = {
      query: vi.fn(async (q, params) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[{ TABLE_NAME: 'orders' }]];
        }
        if (q.includes('INFORMATION_SCHEMA.STATISTICS')) {
          return [[]];
        }
        if (q.includes('COLUMN_NAME = ?')) {
          const colName = params && params[1] ? params[1] : 'selected_offer_id';
          const matchDef = RECONCILIATION_COLUMNS.orders.find(c => c.name.toLowerCase() === colName.toLowerCase());
          return [[
            {
              COLUMN_NAME: colName,
              DATA_TYPE: matchDef ? matchDef.expectedDataType : 'varchar',
              CHARACTER_MAXIMUM_LENGTH: (matchDef && matchDef.minCharacterLength) || null,
              IS_NULLABLE: 'YES',
              COLUMN_DEFAULT: null
            }
          ]];
        }
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) {
          return [initialCols];
        }
        if (q.startsWith('ALTER TABLE')) {
          alterAttempted = true;
          const dupErr = new Error("Duplicate column name 'selected_offer_id'");
          dupErr.code = 'ER_DUP_FIELDNAME';
          dupErr.errno = 1060;
          throw dupErr;
        }
        return [[]];
      })
    };

    await expect(runMigration161PreRemediation(mockConn)).resolves.toBeUndefined();
  });

  // 10. File integrity and DDL syntax certification
  it('10. Confirms migrations/161_phase184g_industrial_persistence_ledger.sql exists and parses valid DDL', () => {
    const migrationFile = path.join(__dirname, '../migrations/161_phase184g_industrial_persistence_ledger.sql');
    expect(fs.existsSync(migrationFile)).toBe(true);

    const content = fs.readFileSync(migrationFile, 'utf8');
    const { parseMigrationSql } = require('../src/api/services/migrationSqlParser');
    const { statements } = parseMigrationSql(content);

    // Verify significant statement count
    expect(statements.length).toBeGreaterThanOrEqual(25);

    // Verify key tables created
    const allSql = statements.map(s => s.sql).join('\n');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS print_nodes');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS node_heartbeats');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS print_node_machine_profiles');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS manufacturing_packages');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS manufacturing_dispatches');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS manufacturing_capacity_reservations');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS manufacturing_dispatch_events');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS live_capacity_snapshots');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS production_evidence_ledger');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS sla_evidence_snapshots');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS federation_factories');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS routing_decisions');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS routing_scores');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS routing_history');
    expect(allSql).toContain('CREATE OR REPLACE VIEW production_packages');
  });

  // 11. OP-01U: validateMigration161PostConditions throws if any active table is missing
  it('11. validateMigration161PostConditions throws if an active industrial table is missing', async () => {
    const mockConn = {
      query: vi.fn(async (q, params) => {
        if (q.includes('information_schema.tables')) {
          if (params && params[0] === 'print_node_machine_profiles') {
            return [[]]; // Table missing!
          }
          return [[{ cnt: 1 }]];
        }
        return [[{ cnt: 1 }]];
      })
    };

    await expect(validateMigration161PostConditions(mockConn))
      .rejects
      .toThrow("POSTCONDITION FAILED: Required active industrial table 'print_node_machine_profiles' missing after migration 161.");
  });

  // 12. OP-01U: validateMigration161PostConditions throws if any active column is missing
  it('12. validateMigration161PostConditions throws if an active column is missing', async () => {
    const mockConn = {
      query: vi.fn(async (q, params) => {
        if (q.includes('information_schema.tables')) {
          return [[{ cnt: 1 }]];
        }
        if (q.includes('information_schema.columns')) {
          if (params && params[1] === 'economic_efficiency' && params[0] === 'print_node_machine_profiles') {
            return [[]]; // Column missing!
          }
          return [[{ cnt: 1 }]];
        }
        return [[{ cnt: 1 }]];
      })
    };

    await expect(validateMigration161PostConditions(mockConn))
      .rejects
      .toThrow("POSTCONDITION FAILED: Required active column 'print_node_machine_profiles.economic_efficiency' missing after migration 161.");
  });

  // 13. OP-01U: validateMigration161PostConditions passes when all 21 tables & 30 columns are present (51/51)
  it('13. validateMigration161PostConditions passes 51/51 checks when all tables and columns exist', async () => {
    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('information_schema.tables') || q.includes('information_schema.columns')) {
          return [[{ cnt: 1 }]];
        }
        return [[]];
      })
    };

    await expect(validateMigration161PostConditions(mockConn)).resolves.toBeUndefined();
    // 21 tables + 30 columns + 7 compatibility table checks + 7 readability checks = 65 checks
    expect(mockConn.query).toHaveBeenCalledTimes(65);
  });

  // 14. OP-02B.2B: Accepts existing DECIMAL(5,2) for printer_nodes.capacity_utilization_pct
  it('14. Accepts existing DECIMAL data type for printer_nodes.capacity_utilization_pct without alterations', async () => {
    const existingCols = [
      { COLUMN_NAME: 'id', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 64, IS_NULLABLE: 'NO', COLUMN_DEFAULT: null },
      ...RECONCILIATION_COLUMNS.printer_nodes.map(c => {
        if (c.name === 'capacity_utilization_pct') {
          return {
            COLUMN_NAME: 'capacity_utilization_pct',
            DATA_TYPE: 'decimal',
            CHARACTER_MAXIMUM_LENGTH: null,
            IS_NULLABLE: 'YES',
            COLUMN_DEFAULT: null
          };
        }
        return {
          COLUMN_NAME: c.name,
          DATA_TYPE: c.expectedDataType,
          CHARACTER_MAXIMUM_LENGTH: c.minCharacterLength || null,
          IS_NULLABLE: c.allowNullable ? 'YES' : 'NO',
          COLUMN_DEFAULT: c.expectedDefault || null
        };
      })
    ];

    let alterCount = 0;
    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[{ TABLE_NAME: 'printer_nodes' }]];
        }
        if (q.includes('INFORMATION_SCHEMA.STATISTICS')) {
          return [[]];
        }
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) {
          return [existingCols];
        }
        if (q.startsWith('ALTER TABLE')) {
          alterCount++;
          return [{ affectedRows: 0 }];
        }
        return [[]];
      })
    };

    await expect(runMigration161PreRemediation(mockConn)).resolves.toBeUndefined();
    expect(alterCount).toBe(0);
  });

  // 15. OP-02B.2B: Accepts INT data type for printer_nodes.capacity_utilization_pct (greenfield / new installs)
  it('15. Accepts standard INT data type for printer_nodes.capacity_utilization_pct on greenfield installs', async () => {
    const existingCols = [
      { COLUMN_NAME: 'id', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 64, IS_NULLABLE: 'NO', COLUMN_DEFAULT: null },
      { COLUMN_NAME: 'capacity_utilization_pct', DATA_TYPE: 'int', CHARACTER_MAXIMUM_LENGTH: null, IS_NULLABLE: 'YES', COLUMN_DEFAULT: '0' }
    ];

    const targetDef = RECONCILIATION_COLUMNS.printer_nodes.find(c => c.name === 'capacity_utilization_pct');
    expect(() => assertColumnCompatibility('printer_nodes', existingCols[1], targetDef)).not.toThrow();
  });

  // 16. OP-02B.2B: Rejects incompatible types (e.g. VARCHAR) for printer_nodes.capacity_utilization_pct
  it('16. Rejects incompatible data types like VARCHAR for printer_nodes.capacity_utilization_pct', async () => {
    const badCol = { COLUMN_NAME: 'capacity_utilization_pct', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 32, IS_NULLABLE: 'YES', COLUMN_DEFAULT: null };
    const targetDef = RECONCILIATION_COLUMNS.printer_nodes.find(c => c.name === 'capacity_utilization_pct');
    expect(() => assertColumnCompatibility('printer_nodes', badCol, targetDef))
      .toThrow("INCOMPATIBLE_COLUMN_DEFINITION: Column 'capacity_utilization_pct' in table 'printer_nodes' has data type 'varchar', expected 'int'");
  });

  // 17. OP-02B.2B: Confirms exception does not leak to other INT columns (e.g. queue_depth, active_jobs)
  it('17. Confirms other INT columns strictly reject DECIMAL type (no indiscriminate widening)', async () => {
    const queueDepthDef = RECONCILIATION_COLUMNS.printer_nodes.find(c => c.name === 'queue_depth');
    const activeJobsDef = RECONCILIATION_COLUMNS.printer_nodes.find(c => c.name === 'active_jobs');

    const decimalCol = { COLUMN_NAME: 'test', DATA_TYPE: 'decimal', IS_NULLABLE: 'YES', COLUMN_DEFAULT: null };

    expect(() => assertColumnCompatibility('printer_nodes', { ...decimalCol, COLUMN_NAME: 'queue_depth' }, queueDepthDef))
      .toThrow("INCOMPATIBLE_COLUMN_DEFINITION: Column 'queue_depth' in table 'printer_nodes' has data type 'decimal', expected 'int'");

    expect(() => assertColumnCompatibility('printer_nodes', { ...decimalCol, COLUMN_NAME: 'active_jobs' }, activeJobsDef))
      .toThrow("INCOMPATIBLE_COLUMN_DEFINITION: Column 'active_jobs' in table 'printer_nodes' has data type 'decimal', expected 'int'");
  });

  // 18. OP-02B.2C: compatibilityViewAdapter handles ER_WRONG_OBJECT for legacy BASE TABLE
  it('18. compatibilityViewAdapter handles ER_WRONG_OBJECT when target is an existing readable BASE TABLE', async () => {
    const { handleCompatibilityViewError, inspectCompatibilityViewStatement } = require('../src/api/services/compatibilityViewAdapter');

    const sql = 'CREATE OR REPLACE VIEW production_packages AS SELECT * FROM manufacturing_packages;';
    const inspect = inspectCompatibilityViewStatement(sql);
    expect(inspect.isCompatView).toBe(true);
    expect(inspect.viewName).toBe('production_packages');

    const mockConn = {
      query: vi.fn(async (q, params) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          expect(params[0]).toBe('production_packages');
          return [[{ TABLE_TYPE: 'BASE TABLE' }]];
        }
        if (q.includes('SELECT 1 FROM `production_packages`')) {
          return [[{ 1: 1 }]];
        }
        return [[]];
      })
    };

    const err = new Error("'Control.production_packages' is not VIEW");
    err.code = 'ER_WRONG_OBJECT';
    err.errno = 1347;

    const handled = await handleCompatibilityViewError(mockConn, sql, err);
    expect(handled).toBe(true);
    expect(mockConn.query).toHaveBeenCalledTimes(2);
  });

  // 19. OP-02B.2C: compatibilityViewAdapter does not handle unreadable BASE TABLE or unauthorized views
  it('19. compatibilityViewAdapter does not handle unreadable BASE TABLE or unauthorized views', async () => {
    const { handleCompatibilityViewError } = require('../src/api/services/compatibilityViewAdapter');

    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[{ TABLE_TYPE: 'BASE TABLE' }]];
        }
        if (q.includes('SELECT 1 FROM')) {
          throw new Error('Table corrupted');
        }
        return [[]];
      })
    };

    const err = new Error('Wrong object');
    err.code = 'ER_WRONG_OBJECT';
    err.errno = 1347;

    // Readable check fails
    const handledCorrupt = await handleCompatibilityViewError(
      mockConn,
      'CREATE OR REPLACE VIEW production_packages AS SELECT * FROM manufacturing_packages;',
      err
    );
    expect(handledCorrupt).toBe(false);

    // Non-authorized view name
    const handledUnknown = await handleCompatibilityViewError(
      mockConn,
      'CREATE OR REPLACE VIEW unknown_custom_view AS SELECT * FROM other;',
      err
    );
    expect(handledUnknown).toBe(false);
  });

  // 20. OP-02B.2C: repairFailedMigration161 requires explicit environment flag
  it('20. repairFailedMigration161 requires explicit flag and validates preconditions', async () => {
    const {
      detectFailedMigration161,
      repairFailedMigration161
    } = require('../src/api/services/migrationRepairService');

    const mockRow = {
      version: '161_phase184g_industrial_persistence_ledger',
      description: '161_phase184g_industrial_persistence_ledger.sql',
      checksum: 'f27c3228674648272c9cfe45556df17da707b6aa8556142b39a4768a5f2b1415',
      state: 'FAILED',
      failure_code: 'ER_WRONG_OBJECT',
      failed_statement_index: 44,
      previous_failures: null,
      execution_id: 'exec-161-test'
    };

    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('SELECT version, description, checksum, state')) {
          return [[mockRow]];
        }
        if (q.includes('SELECT version, description, checksum, record_type')) {
          return [[mockRow]];
        }
        if (q.includes('UPDATE schema_versions')) {
          return [{ affectedRows: 1 }];
        }
        return [[]];
      })
    };

    // Detection
    const detection = await detectFailedMigration161(mockConn);
    expect(detection.detected).toBe(true);

    // Fails without flag
    delete process.env.PPOS_ALLOW_FAILED_161_RETRY;
    await expect(repairFailedMigration161(mockConn))
      .rejects
      .toThrow('GOVERNED_REPAIR_REQUIRED');

    // Succeeds with flag
    process.env.PPOS_ALLOW_FAILED_161_RETRY = 'true';
    const result = await repairFailedMigration161(mockConn);
    expect(result.repaired).toBe(true);
    expect(result.state).toBe('STARTED');
    expect(result.auditMarker.action).toBe('FAILED_161_REPAIR_RETRY');
    expect(result.auditMarker.failure_code).toBe('ER_WRONG_OBJECT');
    expect(result.auditMarker.failed_statement_index).toBe(44);

    delete process.env.PPOS_ALLOW_FAILED_161_RETRY;
  });

  // 20b. Governed recovery from orphaned STARTED state
  it('20b. repairFailedMigration161 recovers from orphaned STARTED state with FAILED_161_REPAIR_RETRY audit marker', async () => {
    const {
      detectFailedMigration161,
      repairFailedMigration161
    } = require('../src/api/services/migrationRepairService');

    const orphanedRow = {
      version: '161_phase184g_industrial_persistence_ledger',
      description: '161_phase184g_industrial_persistence_ledger.sql',
      checksum: 'f27c3228674648272c9cfe45556df17da707b6aa8556142b39a4768a5f2b1415',
      state: 'STARTED',
      failure_code: null,
      failed_statement_index: null,
      previous_failures: JSON.stringify([{
        action: 'FAILED_161_REPAIR_RETRY',
        repaired_at: '2026-10-18T10:00:00.000Z',
        previous_state: 'FAILED',
        failure_code: 'ER_WRONG_OBJECT',
        failed_statement_index: 44
      }]),
      execution_id: 'exec-orphaned-161'
    };

    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('SELECT version, description, checksum, state')) {
          return [[orphanedRow]];
        }
        if (q.includes('SELECT version, description, checksum, record_type')) {
          return [[orphanedRow]];
        }
        if (q.includes('UPDATE schema_versions')) {
          return [{ affectedRows: 1 }];
        }
        return [[]];
      })
    };

    // Detection identifies orphaned retry
    const detection = await detectFailedMigration161(mockConn);
    expect(detection.detected).toBe(true);
    expect(detection.state).toBe('STARTED');
    expect(detection.orphanedRetry).toBe(true);

    // Requires opt-in flag
    delete process.env.PPOS_ALLOW_FAILED_161_RETRY;
    await expect(repairFailedMigration161(mockConn))
      .rejects
      .toThrow('GOVERNED_REPAIR_REQUIRED');

    // Succeeds when authorized
    process.env.PPOS_ALLOW_FAILED_161_RETRY = 'true';
    const result = await repairFailedMigration161(mockConn);
    expect(result.repaired).toBe(true);
    expect(result.state).toBe('STARTED');
    expect(result.auditMarker.action).toBe('ORPHANED_STARTED_161_RECOVERY');
    expect(result.auditMarker.previous_state).toBe('STARTED');

    delete process.env.PPOS_ALLOW_FAILED_161_RETRY;
  });

  // 20c. evaluateLedgerStatus respects authorizedMigrationPath without globally ignoring concurrent runners
  it('20c. evaluateLedgerStatus respects authorizedMigrationPath while blocking foreign started migrations', async () => {
    const ledgerReadService = require('../src/api/services/migrationLedgerReadService');
    const db = require('../src/api/services/mysqlClient');
    const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, '../migrations/migration-integrity-baseline.json'), 'utf8'));

    const mockStarted161 = {
      version: '161_phase184g_industrial_persistence_ledger',
      description: '161_phase184g_industrial_persistence_ledger.sql',
      record_type: 'MIGRATION',
      migration_path: 'migrations/161_phase184g_industrial_persistence_ledger.sql',
      checksum: 'f27c3228674648272c9cfe45556df17da707b6aa8556142b39a4768a5f2b1415',
      state: 'STARTED',
      started_at: new Date(Date.now() - 60000).toISOString(),
      heartbeat_at: new Date(Date.now() - 10000).toISOString()
    };

    vi.spyOn(db, 'query').mockImplementation(async (sql) => {
      if (sql.includes('information_schema.TABLES')) return [{ TABLE_NAME: 'schema_versions' }];
      if (sql.includes('information_schema.COLUMNS')) return [{ COLUMN_NAME: 'state' }, { COLUMN_NAME: 'record_type' }];
      if (sql.includes('SELECT version, description')) {
        return [mockStarted161];
      }
      return [];
    });

    // Without authorization: blocked with MIGRATION_IN_PROGRESS
    const unauthStatus = await ledgerReadService.evaluateLedgerStatus(baseline, 30);
    expect(unauthStatus.status).toBe('MIGRATION_IN_PROGRESS');

    // With authorization for 161: passes through to PENDING_MIGRATIONS (or READY if match)
    const authStatus = await ledgerReadService.evaluateLedgerStatus(baseline, 30, {
      authorizedMigrationPath: 'migrations/161_phase184g_industrial_persistence_ledger.sql'
    });
    expect(authStatus.status).toBe('PENDING_MIGRATIONS');

    // If another foreign migration is started, it is STILL blocked
    const mockForeignStarted = {
      version: '150_some_other_migration',
      description: '150_some_other_migration.sql',
      record_type: 'MIGRATION',
      migration_path: 'migrations/150_some_other_migration.sql',
      checksum: 'abc',
      state: 'STARTED',
      started_at: new Date(Date.now() - 60000).toISOString(),
      heartbeat_at: new Date(Date.now() - 10000).toISOString()
    };
    vi.spyOn(db, 'query').mockImplementation(async (sql) => {
      if (sql.includes('information_schema.TABLES')) return [{ TABLE_NAME: 'schema_versions' }];
      if (sql.includes('information_schema.COLUMNS')) return [{ COLUMN_NAME: 'state' }, { COLUMN_NAME: 'record_type' }];
      if (sql.includes('SELECT version, description')) {
        return [mockStarted161, mockForeignStarted];
      }
      return [];
    });

    const foreignStatus = await ledgerReadService.evaluateLedgerStatus(baseline, 30, {
      authorizedMigrationPath: 'migrations/161_phase184g_industrial_persistence_ledger.sql'
    });
    expect(foreignStatus.status).toBe('MIGRATION_IN_PROGRESS');
    expect(foreignStatus.reason).toContain('migrations/150_some_other_migration.sql');
  });

  // 21. OP-02B.2C: validateMigration161PostConditions asserts legacy compatibility objects exist and are queryable
  it('21. validateMigration161PostConditions checks all 7 legacy compatibility objects', async () => {
    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('FROM information_schema.tables')) {
          return [[{ cnt: 1, TABLE_TYPE: 'BASE TABLE' }]];
        }
        if (q.includes('FROM information_schema.columns')) {
          return [[{ cnt: 1 }]];
        }
        if (q.startsWith('SELECT 1 FROM')) {
          return [[{ 1: 1 }]];
        }
        return [[]];
      })
    };

    await expect(validateMigration161PostConditions(mockConn)).resolves.toBeUndefined();
  });
});

