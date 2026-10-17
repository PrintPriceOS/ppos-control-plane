import { describe, it, expect, vi } from 'vitest';
const {
  LEGACY_PHASE_MARKERS,
  handleLegacyPhaseMarkerStatement,
  isSchemaVersionsInsert
} = require('../src/api/services/legacyPhaseMarkerAdapter');
const { handleLegacyPhaseMarkerStatement: exportedFromMigrationService } = require('../src/api/services/migrationService');

describe('CI-02G: Legacy Phase Marker Compatibility Adapter', () => {

  it('1. Verifies that the exported adapter from migrationService is identical to the real module', () => {
    expect(typeof exportedFromMigrationService).toBe('function');
    expect(exportedFromMigrationService).toBe(handleLegacyPhaseMarkerStatement);
  });

  it('2. Successfully handles all 12 authorized phase markers with exact specification', async () => {
    for (const [version, meta] of Object.entries(LEGACY_PHASE_MARKERS)) {
      const sql = meta.hasOnDuplicate
        ? `INSERT INTO schema_versions (version, applied_at, description) VALUES ('${version}', NOW(), '${meta.description}') ON DUPLICATE KEY UPDATE applied_at = NOW(), description = '${meta.description}';`
        : `INSERT INTO schema_versions (version, applied_at, description) VALUES ('${version}', NOW(), '${meta.description}');`;

      const executedQueries = [];
      const mockConn = {
        query: vi.fn(async (q, params) => {
          executedQueries.push({ q, params });
          if (q.startsWith('SELECT')) {
            return [[]]; // No existing row
          }
          return [{ affectedRows: 1 }];
        })
      };

      const handled = await handleLegacyPhaseMarkerStatement(mockConn, sql, meta.file);
      expect(handled).toBe(true);

      // Verify SELECT query
      expect(executedQueries[0].q).toContain('SELECT version, description, record_type, checksum, state FROM schema_versions');
      expect(executedQueries[0].params).toEqual([version]);

      // Verify safe INSERT query with record_type='PHASE_MARKER' and checksum=''
      expect(executedQueries[1].q).toContain("record_type,");
      expect(executedQueries[1].q).toContain("'PHASE_MARKER'");
      expect(executedQueries[1].q).toContain("''");
      expect(executedQueries[1].params).toEqual([version, meta.description]);
    }
  });

  it('3. Handles simple INSERT for version 080', async () => {
    const meta = LEGACY_PHASE_MARKERS['080'];
    const sql = `INSERT INTO schema_versions (version, applied_at, description) VALUES ('080', NOW(), '${meta.description}');`;

    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.startsWith('SELECT')) return [[]];
        return [{ affectedRows: 1 }];
      })
    };

    const handled = await handleLegacyPhaseMarkerStatement(mockConn, sql, meta.file);
    expect(handled).toBe(true);
    expect(mockConn.query).toHaveBeenCalledTimes(2);
  });

  it('4. Handles INSERT ... ON DUPLICATE KEY UPDATE for versions 081-091', async () => {
    const meta = LEGACY_PHASE_MARKERS['085'];
    const sql = `INSERT INTO schema_versions (version, applied_at, description)\nVALUES ('085', NOW(), '${meta.description}')\nON DUPLICATE KEY UPDATE applied_at = NOW(), description = '${meta.description}';`;

    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.startsWith('SELECT')) return [[]];
        return [{ affectedRows: 1 }];
      })
    };

    const handled = await handleLegacyPhaseMarkerStatement(mockConn, sql, meta.file);
    expect(handled).toBe(true);
  });

  it('5. Ignores ordinary SQL and returns false without modifying or querying schema_versions', async () => {
    const mockConn = { query: vi.fn() };
    const ordinarySql = 'CREATE TABLE foo (id INT PRIMARY KEY);';

    const handled = await handleLegacyPhaseMarkerStatement(mockConn, ordinarySql, '080_phase132.sql');
    expect(handled).toBe(false);
    expect(mockConn.query).not.toHaveBeenCalled();
  });

  it('6. Rejects tampered/manipulated description with explicit error', async () => {
    const meta = LEGACY_PHASE_MARKERS['080'];
    const sql = `INSERT INTO schema_versions (version, applied_at, description) VALUES ('080', NOW(), 'Hacked description');`;

    const mockConn = { query: vi.fn() };

    await expect(handleLegacyPhaseMarkerStatement(mockConn, sql, meta.file))
      .rejects
      .toThrow('LEGACY_PHASE_MARKER_DESCRIPTION_MISMATCH');
    
    expect(mockConn.query).not.toHaveBeenCalled();
  });

  it('7. Rejects unauthorized provenance / wrong source file', async () => {
    const meta = LEGACY_PHASE_MARKERS['080'];
    const sql = `INSERT INTO schema_versions (version, applied_at, description) VALUES ('080', NOW(), '${meta.description}');`;

    const mockConn = { query: vi.fn() };

    await expect(handleLegacyPhaseMarkerStatement(mockConn, sql, '001_create_schema_version.sql'))
      .rejects
      .toThrow('UNAUTHORIZED_LEGACY_PHASE_MARKER_PROVENANCE');

    expect(mockConn.query).not.toHaveBeenCalled();
  });

  it('8. Rejects if version collides with an existing real MIGRATION row', async () => {
    const meta = LEGACY_PHASE_MARKERS['080'];
    const sql = `INSERT INTO schema_versions (version, applied_at, description) VALUES ('080', NOW(), '${meta.description}');`;

    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.startsWith('SELECT')) {
          return [[{
            version: '080',
            description: meta.description,
            record_type: 'MIGRATION',
            checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            state: 'APPLIED'
          }]];
        }
        return [{ affectedRows: 0 }];
      })
    };

    await expect(handleLegacyPhaseMarkerStatement(mockConn, sql, meta.file))
      .rejects
      .toThrow('COLLISION_WITH_REAL_MIGRATION');
    
    expect(mockConn.query).toHaveBeenCalledTimes(1); // Only the SELECT
  });

  it('9. Provides idempotent no-op when an identical PHASE_MARKER already exists', async () => {
    const meta = LEGACY_PHASE_MARKERS['080'];
    const sql = `INSERT INTO schema_versions (version, applied_at, description) VALUES ('080', NOW(), '${meta.description}');`;

    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.startsWith('SELECT')) {
          return [[{
            version: '080',
            description: meta.description,
            record_type: 'PHASE_MARKER',
            checksum: '',
            state: 'APPLIED'
          }]];
        }
        return [{ affectedRows: 0 }];
      })
    };

    const handled = await handleLegacyPhaseMarkerStatement(mockConn, sql, meta.file);
    expect(handled).toBe(true);
    expect(mockConn.query).toHaveBeenCalledTimes(1); // Only the SELECT, no redundant INSERT
  });

  it('10. Rejects when existing PHASE_MARKER has incompatible description or state', async () => {
    const meta = LEGACY_PHASE_MARKERS['080'];
    const sql = `INSERT INTO schema_versions (version, applied_at, description) VALUES ('080', NOW(), '${meta.description}');`;

    const mockConn = {
      query: vi.fn(async (q) => {
        if (q.startsWith('SELECT')) {
          return [[{
            version: '080',
            description: 'Different old description',
            record_type: 'PHASE_MARKER',
            checksum: '',
            state: 'APPLIED'
          }]];
        }
        return [{ affectedRows: 0 }];
      })
    };

    await expect(handleLegacyPhaseMarkerStatement(mockConn, sql, meta.file))
      .rejects
      .toThrow('INCOMPATIBLE_EXISTING_PHASE_MARKER');
  });

  it('11. Propagates real database errors without suppressing them', async () => {
    const meta = LEGACY_PHASE_MARKERS['080'];
    const sql = `INSERT INTO schema_versions (version, applied_at, description) VALUES ('080', NOW(), '${meta.description}');`;

    const dbError = new Error('ECONNRESET: Connection lost');
    dbError.code = 'ECONNRESET';

    const mockConn = {
      query: vi.fn(async () => {
        throw dbError;
      })
    };

    await expect(handleLegacyPhaseMarkerStatement(mockConn, sql, meta.file))
      .rejects
      .toThrow('ECONNRESET: Connection lost');
  });

  it('12. Rejects unauthorized INSERT INTO schema_versions formatting from authorized migration file', async () => {
    const badSql = "INSERT INTO schema_versions (version, description) VALUES ('080', 'Incomplete');";
    const mockConn = { query: vi.fn() };

    await expect(handleLegacyPhaseMarkerStatement(mockConn, badSql, '080_phase132_controlled_invite_only_expansion_preparation_gate.sql'))
      .rejects
      .toThrow('UNAUTHORIZED_SCHEMA_VERSIONS_INSERT_FORMAT');
  });

  it('13. Preserves ON DUPLICATE KEY UPDATE protection against arbitrary state override', async () => {
    // Check SQL generation safety in adapter
    const meta = LEGACY_PHASE_MARKERS['081'];
    const sql = `INSERT INTO schema_versions (version, applied_at, description) VALUES ('081', NOW(), '${meta.description}') ON DUPLICATE KEY UPDATE applied_at = NOW(), description = '${meta.description}';`;

    let executedInsert = null;
    const mockConn = {
      query: vi.fn(async (q, params) => {
        if (q.startsWith('SELECT')) return [[]];
        executedInsert = q;
        return [{ affectedRows: 1 }];
      })
    };

    await handleLegacyPhaseMarkerStatement(mockConn, sql, meta.file);
    expect(executedInsert).toContain("record_type = IF(record_type = 'MIGRATION', 'MIGRATION', 'PHASE_MARKER')");
    expect(executedInsert).toContain("checksum = IF(record_type = 'MIGRATION', checksum, '')");
    expect(executedInsert).toContain("state = IF(record_type = 'MIGRATION', state, 'APPLIED')");
  });
});
