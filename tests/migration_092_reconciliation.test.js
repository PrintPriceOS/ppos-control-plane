import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const {
  RECONCILIATION_COLUMNS,
  REQUIRED_087_COLUMNS,
  runMigration092PreRemediation
} = require('../src/api/services/migration092ReconciliationService');
const { runMigration092PreRemediation: exportedFromMigrationService } = require('../src/api/services/migrationService');

describe('CI-02I: Migration 092 Structural Reconciliation Suite', () => {
  const originalEnv = process.env.PPOS_MIGRATION_EXECUTION;

  beforeEach(() => {
    process.env.PPOS_MIGRATION_EXECUTION = 'true';
  });

  afterEach(() => {
    process.env.PPOS_MIGRATION_EXECUTION = originalEnv;
  });

  it('1. Verifies that the exported function from migrationService matches real module', () => {
    expect(typeof exportedFromMigrationService).toBe('function');
    expect(exportedFromMigrationService).toBe(runMigration092PreRemediation);
  });

  it('2. Prohibits execution outside authorized migration context', async () => {
    process.env.PPOS_MIGRATION_EXECUTION = 'false';
    const mockConn = { query: vi.fn() };

    await expect(runMigration092PreRemediation(mockConn))
      .rejects
      .toThrow('DDL_EXECUTION_FORBIDDEN_OUTSIDE_MIGRATION_CONTEXT');

    expect(mockConn.query).not.toHaveBeenCalled();
  });

  it('3. Skips gracefully if controlled_beta_cohort_intervention_approvals does not exist yet', async () => {
    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[]]; // Table does not exist
        }
        return [[]];
      })
    };

    await expect(runMigration092PreRemediation(mockConn)).resolves.toBeUndefined();
    expect(mockConn.query).toHaveBeenCalledTimes(1);
  });

  it('4. Reconciles valid Phase 139 (087) layout by adding missing Phase 144 columns', async () => {
    // Layout from 087: has required core columns, but none of 092 supplementary columns
    const columns087 = REQUIRED_087_COLUMNS.map(name => ({
      COLUMN_NAME: name,
      DATA_TYPE: 'varchar',
      IS_NULLABLE: 'NO',
      COLUMN_DEFAULT: null
    }));

    const executedAlterStmts = [];
    const mockConn = {
      query: vi.fn(async (q, params) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[{ TABLE_NAME: 'controlled_beta_cohort_intervention_approvals' }]];
        }
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) {
          return [columns087];
        }
        if (q.startsWith('ALTER TABLE')) {
          executedAlterStmts.push(q);
          return [{ affectedRows: 0 }];
        }
        return [[]];
      })
    };

    await runMigration092PreRemediation(mockConn);

    // Must have executed ALTER TABLE for every supplementary column in RECONCILIATION_COLUMNS
    expect(executedAlterStmts.length).toBe(RECONCILIATION_COLUMNS.length);

    // Verify key columns exist in executed ALTER statements
    const allAlters = executedAlterStmts.join('\n');
    expect(allAlters).toContain("ADD COLUMN write_scope_status VARCHAR(32) NOT NULL DEFAULT 'PENDING'");
    expect(allAlters).toContain("ADD COLUMN guardrail_status VARCHAR(32) NOT NULL DEFAULT 'PENDING'");
    expect(allAlters).toContain("ADD COLUMN source_prep_id VARCHAR(64) NULL");
    expect(allAlters).toContain("ADD COLUMN source_prep_evidence_pack_hash VARCHAR(128) NULL");
    expect(allAlters).toContain("ADD COLUMN execution_capability_status VARCHAR(64) NOT NULL DEFAULT 'EXECUTION_NOT_ENABLED'");
    expect(allAlters).toContain("ADD COLUMN approval_execution_status VARCHAR(64) NOT NULL DEFAULT 'NOT_APPROVED_NOT_EXECUTED'");
    expect(allAlters).toContain("ADD COLUMN future_execution_eligibility_status VARCHAR(128) NOT NULL DEFAULT 'NOT_ELIGIBLE'");
  });

  it('5. Operates idempotently when all columns already exist', async () => {
    // All 087 columns PLUS all RECONCILIATION_COLUMNS
    const fullColumns = [
      ...REQUIRED_087_COLUMNS.map(name => ({ COLUMN_NAME: name, DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 64, IS_NULLABLE: 'NO', COLUMN_DEFAULT: null })),
      ...RECONCILIATION_COLUMNS.map(c => ({
        COLUMN_NAME: c.name,
        DATA_TYPE: c.expectedDataType,
        CHARACTER_MAXIMUM_LENGTH: c.minCharacterLength || null,
        IS_NULLABLE: c.allowNullable ? 'YES' : 'NO',
        COLUMN_DEFAULT: c.expectedDefault ? `'${c.expectedDefault}'` : null
      }))
    ];

    let alterCount = 0;
    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[{ TABLE_NAME: 'controlled_beta_cohort_intervention_approvals' }]];
        }
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) {
          return [fullColumns];
        }
        if (q.startsWith('ALTER TABLE')) {
          alterCount++;
          return [{ affectedRows: 0 }];
        }
        return [[]];
      })
    };

    await runMigration092PreRemediation(mockConn);
    expect(alterCount).toBe(0); // 100% no-op
  });

  it('6. Rejects when mandatory Phase 139 baseline columns are missing', async () => {
    // Only has approval_id, missing source_preparation_id, etc.
    const deficientColumns = [
      { COLUMN_NAME: 'approval_id', DATA_TYPE: 'varchar' }
    ];

    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[{ TABLE_NAME: 'controlled_beta_cohort_intervention_approvals' }]];
        }
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) {
          return [deficientColumns];
        }
        return [[]];
      })
    };

    await expect(runMigration092PreRemediation(mockConn))
      .rejects
      .toThrow('PRECONDITION_FAILED: Table controlled_beta_cohort_intervention_approvals exists but is missing mandatory Phase 139 columns');
  });

  it('7. Rejects when existing column has an incompatible data type', async () => {
    // write_scope_status exists but with an incompatible type (e.g. INT instead of VARCHAR)
    const incompatibleColumns = [
      ...REQUIRED_087_COLUMNS.map(name => ({ COLUMN_NAME: name, DATA_TYPE: 'varchar' })),
      { COLUMN_NAME: 'write_scope_status', DATA_TYPE: 'int', CHARACTER_MAXIMUM_LENGTH: null, IS_NULLABLE: 'NO', COLUMN_DEFAULT: "'PENDING'" }
    ];

    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[{ TABLE_NAME: 'controlled_beta_cohort_intervention_approvals' }]];
        }
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) {
          return [incompatibleColumns];
        }
        return [[]];
      })
    };

    await expect(runMigration092PreRemediation(mockConn))
      .rejects
      .toThrow("INCOMPATIBLE_COLUMN_DEFINITION: Column 'write_scope_status' in table 'controlled_beta_cohort_intervention_approvals' has data type 'int'");
  });

  it('8. Tolerates concurrent duplicate column error (ER_DUP_FIELDNAME / 1060) when re-read column is compatible', async () => {
    const columns087 = REQUIRED_087_COLUMNS.map(name => ({ COLUMN_NAME: name, DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 64, IS_NULLABLE: 'NO', COLUMN_DEFAULT: null }));
    let isSecondRead = false;

    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[{ TABLE_NAME: 'controlled_beta_cohort_intervention_approvals' }]];
        }
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) {
          if (!isSecondRead) {
            return [columns087];
          }
          // On reload after ER_DUP_FIELDNAME, return all reconciliation columns so loop terminates safely
          return [[
            ...columns087,
            ...RECONCILIATION_COLUMNS.map(c => ({
              COLUMN_NAME: c.name,
              DATA_TYPE: c.expectedDataType,
              CHARACTER_MAXIMUM_LENGTH: c.minCharacterLength || null,
              IS_NULLABLE: c.allowNullable ? 'YES' : 'NO',
              COLUMN_DEFAULT: c.expectedDefault ? `'${c.expectedDefault}'` : null
            }))
          ]];
        }
        if (q.startsWith('ALTER TABLE')) {
          isSecondRead = true;
          const dupErr = new Error("Duplicate column name 'source_prep_id'");
          dupErr.code = 'ER_DUP_FIELDNAME';
          dupErr.errno = 1060;
          throw dupErr;
        }
        return [[]];
      })
    };

    await expect(runMigration092PreRemediation(mockConn)).resolves.toBeUndefined();
  });

  it('9. Propagates unexpected database errors without swallowing them', async () => {
    const columns087 = REQUIRED_087_COLUMNS.map(name => ({ COLUMN_NAME: name, DATA_TYPE: 'varchar' }));

    const dbError = new Error('ER_LOCK_DEADLOCK: Deadlock found when trying to get lock');
    dbError.code = 'ER_LOCK_DEADLOCK';

    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[{ TABLE_NAME: 'controlled_beta_cohort_intervention_approvals' }]];
        }
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) {
          return [columns087];
        }
        if (q.startsWith('ALTER TABLE')) {
          throw dbError;
        }
        return [[]];
      })
    };

    await expect(runMigration092PreRemediation(mockConn))
      .rejects
      .toThrow('ER_LOCK_DEADLOCK: Deadlock found when trying to get lock');
  });

  it('10. Rejects when an existing column has an incompatible length, nullability, or default value', async () => {
    // 10a: Length too short (e.g. source_prep_hash VARCHAR(32) instead of VARCHAR(128))
    const shortLengthCols = [
      ...REQUIRED_087_COLUMNS.map(name => ({ COLUMN_NAME: name, DATA_TYPE: 'varchar' })),
      { COLUMN_NAME: 'source_prep_hash', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 32, IS_NULLABLE: 'YES', COLUMN_DEFAULT: null }
    ];

    const mockConnShort = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) return [[{ TABLE_NAME: 'controlled_beta_cohort_intervention_approvals' }]];
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) return [shortLengthCols];
        return [[]];
      })
    };

    await expect(runMigration092PreRemediation(mockConnShort))
      .rejects
      .toThrow("INCOMPATIBLE_COLUMN_DEFINITION: Column 'source_prep_hash' in table 'controlled_beta_cohort_intervention_approvals' has length 32, expected at least 128");

    // 10b: Incompatible nullability (write_scope_status is nullable instead of NOT NULL)
    const nullableScopeCols = [
      ...REQUIRED_087_COLUMNS.map(name => ({ COLUMN_NAME: name, DATA_TYPE: 'varchar' })),
      { COLUMN_NAME: 'write_scope_status', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 32, IS_NULLABLE: 'YES', COLUMN_DEFAULT: 'PENDING' }
    ];

    const mockConnNullable = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) return [[{ TABLE_NAME: 'controlled_beta_cohort_intervention_approvals' }]];
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) return [nullableScopeCols];
        return [[]];
      })
    };

    await expect(runMigration092PreRemediation(mockConnNullable))
      .rejects
      .toThrow("INCOMPATIBLE_COLUMN_DEFINITION: Column 'write_scope_status' in table 'controlled_beta_cohort_intervention_approvals' is NULLABLE, expected NOT NULL");

    // 10c: Incompatible default value (guardrail_status has default 'ACTIVE' instead of 'PENDING')
    const badDefaultCols = [
      ...REQUIRED_087_COLUMNS.map(name => ({ COLUMN_NAME: name, DATA_TYPE: 'varchar' })),
      { COLUMN_NAME: 'guardrail_status', DATA_TYPE: 'varchar', CHARACTER_MAXIMUM_LENGTH: 32, IS_NULLABLE: 'NO', COLUMN_DEFAULT: 'ACTIVE' }
    ];

    const mockConnBadDefault = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) return [[{ TABLE_NAME: 'controlled_beta_cohort_intervention_approvals' }]];
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) return [badDefaultCols];
        return [[]];
      })
    };

    await expect(runMigration092PreRemediation(mockConnBadDefault))
      .rejects
      .toThrow("INCOMPATIBLE_COLUMN_DEFINITION: Column 'guardrail_status' in table 'controlled_beta_cohort_intervention_approvals' has default 'ACTIVE', expected 'PENDING'");
  });

  it('11. Rejects when a concurrent ER_DUP_FIELDNAME column turns out to be incompatible upon re-read', async () => {
    const columns087 = REQUIRED_087_COLUMNS.map(name => ({ COLUMN_NAME: name, DATA_TYPE: 'varchar' }));

    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.includes('INFORMATION_SCHEMA.TABLES')) {
          return [[{ TABLE_NAME: 'controlled_beta_cohort_intervention_approvals' }]];
        }
        if (q.includes('INFORMATION_SCHEMA.COLUMNS')) {
          // Re-read returns concurrent column with bad type (int instead of varchar)
          return [[
            ...columns087,
            { COLUMN_NAME: 'source_prep_id', DATA_TYPE: 'int', CHARACTER_MAXIMUM_LENGTH: null, IS_NULLABLE: 'YES', COLUMN_DEFAULT: null }
          ]];
        }
        if (q.startsWith('ALTER TABLE')) {
          const dupErr = new Error("Duplicate column name 'source_prep_id'");
          dupErr.code = 'ER_DUP_FIELDNAME';
          dupErr.errno = 1060;
          throw dupErr;
        }
        return [[]];
      })
    };

    await expect(runMigration092PreRemediation(mockConn))
      .rejects
      .toThrow("INCOMPATIBLE_COLUMN_DEFINITION: Column 'source_prep_id' in table 'controlled_beta_cohort_intervention_approvals' has data type 'int', expected 'varchar'");
  });
});
