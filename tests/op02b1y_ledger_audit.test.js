'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';

const db = require('../src/api/services/mysqlClient');
const ledgerReadService = require('../src/api/services/migrationLedgerReadService');

describe('STG-02: Historical Ledger Governance, Forensic Invariants & State Machine Audit', () => {
  const originalEnv = { ...process.env };
  const baselinePath = path.join(__dirname, '../migrations/migration-integrity-baseline.json');
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('1. Correctly classifies and ignores BASELINE_MARKER (1.0.0) without expecting it in baseline migrations', async () => {
    vi.spyOn(db, 'query').mockImplementation(async (sql) => {
      if (sql.includes('information_schema.COLUMNS')) {
        return [{ COLUMN_NAME: 'state' }, { COLUMN_NAME: 'record_type' }];
      }
      if (sql.includes('information_schema.TABLES')) {
        return [{ TABLE_NAME: 'schema_versions' }];
      }
      if (sql.includes('SELECT version, description')) {
        // Return 1.0.0 baseline marker plus all real baseline migrations
        const rows = [
          {
            version: '1.0.0',
            description: 'Initial Production Baseline',
            record_type: 'BASELINE_MARKER',
            migration_path: null,
            checksum: '',
            state: 'APPLIED',
            started_at: '2026-01-01 00:00:00'
          },
          ...baseline.migrations.map(m => {
            const fname = (m.path || m.relativePath).split('/').pop();
            return {
              version: fname.replace(/\.sql$/, ''),
              description: fname,
              record_type: 'MIGRATION',
              migration_path: m.path || m.relativePath,
              checksum: m.canonicalSha256 || m.sha256,
              state: 'APPLIED',
              started_at: '2026-01-01 00:01:00'
            };
          })
        ];
        return rows;
      }
      return [];
    });

    const result = await ledgerReadService.evaluateLedgerStatus(baseline);
    expect(result.status).toBe('READY');
  });

  it('2. Correctly classifies and ignores legacy PHASE_MARKER rows (080-091) without failing as unknown', async () => {
    vi.spyOn(db, 'query').mockImplementation(async (sql) => {
      if (sql.includes('information_schema.COLUMNS')) {
        return [{ COLUMN_NAME: 'state' }, { COLUMN_NAME: 'record_type' }];
      }
      if (sql.includes('information_schema.TABLES')) {
        return [{ TABLE_NAME: 'schema_versions' }];
      }
      if (sql.includes('SELECT version, description')) {
        const rows = [
          {
            version: '080',
            description: 'Phase 120: Dynamic Pricing Governance',
            record_type: 'PHASE_MARKER',
            migration_path: null,
            checksum: '',
            state: 'APPLIED',
            started_at: '2026-01-01 00:00:00'
          },
          {
            version: '081',
            description: 'Phase 121: Telemetry Hooks',
            record_type: null, // Legacy untyped marker
            migration_path: null,
            checksum: '',
            state: 'APPLIED',
            started_at: '2026-01-01 00:00:01'
          },
          ...baseline.migrations.map(m => {
            const fname = (m.path || m.relativePath).split('/').pop();
            return {
              version: fname.replace(/\.sql$/, ''),
              description: fname,
              record_type: 'MIGRATION',
              migration_path: m.path || m.relativePath,
              checksum: m.canonicalSha256 || m.sha256,
              state: 'APPLIED',
              started_at: '2026-01-01 00:01:00'
            };
          })
        ];
        return rows;
      }
      return [];
    });

    const result = await ledgerReadService.evaluateLedgerStatus(baseline);
    expect(result.status).toBe('READY');
  });

  it('3. Never unlocks automatically on FAILED migration unless PPOS_ALLOW_MIGRATION_RETRY is explicit and checksum matches', async () => {
    const failedMigration = baseline.migrations[0];
    const pathKey = failedMigration.path || failedMigration.relativePath;
    const expectedHash = failedMigration.canonicalSha256 || failedMigration.sha256;
    const fname = pathKey.split('/').pop();

    vi.spyOn(db, 'query').mockImplementation(async (sql) => {
      if (sql.includes('information_schema.COLUMNS')) {
        return [{ COLUMN_NAME: 'state' }, { COLUMN_NAME: 'record_type' }];
      }
      if (sql.includes('information_schema.TABLES')) {
        return [{ TABLE_NAME: 'schema_versions' }];
      }
      if (sql.includes('SELECT version, description')) {
        return [
          {
            version: fname.replace(/\.sql$/, ''),
            description: fname,
            record_type: 'MIGRATION',
            migration_path: pathKey,
            checksum: expectedHash,
            state: 'FAILED',
            failure_code: 'ER_SYNTAX_ERROR',
            started_at: '2026-01-01 00:00:00'
          }
        ];
      }
      return [];
    });

    // Default: fail-closed, does NOT auto-unlock
    process.env.PPOS_ALLOW_MIGRATION_RETRY = 'false';
    const blockedResult = await ledgerReadService.evaluateLedgerStatus(baseline);
    expect(blockedResult.status).toBe('MIGRATION_FAILED');
    expect(blockedResult.reason).toContain('Migration failed');

    // Tampered checksum: even with retry flag, rejects if checksum diverged
    process.env.PPOS_ALLOW_MIGRATION_RETRY = 'true';
    vi.spyOn(db, 'query').mockImplementation(async (sql) => {
      if (sql.includes('information_schema.COLUMNS')) return [{ COLUMN_NAME: 'state' }, { COLUMN_NAME: 'record_type' }];
      if (sql.includes('information_schema.TABLES')) return [{ TABLE_NAME: 'schema_versions' }];
      if (sql.includes('SELECT version, description')) {
        return [
          {
            version: fname.replace(/\.sql$/, ''),
            description: fname,
            record_type: 'MIGRATION',
            migration_path: pathKey,
            checksum: 'tampered_deadbeef_invalid_hash',
            state: 'FAILED',
            failure_code: 'ER_SYNTAX_ERROR',
            started_at: '2026-01-01 00:00:00'
          }
        ];
      }
      return [];
    });

    const tamperedRetryResult = await ledgerReadService.evaluateLedgerStatus(baseline);
    expect(tamperedRetryResult.status).toBe('MIGRATION_FAILED');
  });

  it('4. Detects and blocks active or stale STARTED migrations', async () => {
    const startedMigration = baseline.migrations[1];
    const pathKey = startedMigration.path || startedMigration.relativePath;
    const fname = pathKey.split('/').pop();

    // Recent STARTED execution (< 30 min)
    vi.spyOn(db, 'query').mockImplementation(async (sql) => {
      if (sql.includes('information_schema.COLUMNS')) return [{ COLUMN_NAME: 'state' }, { COLUMN_NAME: 'record_type' }];
      if (sql.includes('information_schema.TABLES')) return [{ TABLE_NAME: 'schema_versions' }];
      if (sql.includes('SELECT version, description')) {
        return [
          {
            version: fname.replace(/\.sql$/, ''),
            description: fname,
            record_type: 'MIGRATION',
            migration_path: pathKey,
            checksum: startedMigration.canonicalSha256 || startedMigration.sha256,
            state: 'STARTED',
            started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            heartbeat_at: new Date(Date.now() - 2 * 60 * 1000).toISOString()
          }
        ];
      }
      return [];
    });

    const activeResult = await ledgerReadService.evaluateLedgerStatus(baseline, 30);
    expect(activeResult.status).toBe('MIGRATION_IN_PROGRESS');

    // Stale STARTED execution (> 30 min)
    vi.spyOn(db, 'query').mockImplementation(async (sql) => {
      if (sql.includes('information_schema.COLUMNS')) return [{ COLUMN_NAME: 'state' }, { COLUMN_NAME: 'record_type' }];
      if (sql.includes('information_schema.TABLES')) return [{ TABLE_NAME: 'schema_versions' }];
      if (sql.includes('SELECT version, description')) {
        return [
          {
            version: fname.replace(/\.sql$/, ''),
            description: fname,
            record_type: 'MIGRATION',
            migration_path: pathKey,
            checksum: startedMigration.canonicalSha256 || startedMigration.sha256,
            state: 'STARTED',
            started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            heartbeat_at: new Date(Date.now() - 45 * 60 * 1000).toISOString()
          }
        ];
      }
      return [];
    });

    const staleResult = await ledgerReadService.evaluateLedgerStatus(baseline, 30);
    expect(staleResult.status).toBe('MIGRATION_FAILED');
    expect(staleResult.reason).toContain('Stale started execution detected');
  });

  it('5. Detects checksum divergence on historical applied records', async () => {
    const firstMigration = baseline.migrations[0];
    const pathKey = firstMigration.path || firstMigration.relativePath;
    const fname = pathKey.split('/').pop();

    vi.spyOn(db, 'query').mockImplementation(async (sql) => {
      if (sql.includes('information_schema.COLUMNS')) return [{ COLUMN_NAME: 'state' }, { COLUMN_NAME: 'record_type' }];
      if (sql.includes('information_schema.TABLES')) return [{ TABLE_NAME: 'schema_versions' }];
      if (sql.includes('SELECT version, description')) {
        return [
          {
            version: fname.replace(/\.sql$/, ''),
            description: fname,
            record_type: 'MIGRATION',
            migration_path: pathKey,
            checksum: 'modified_checksum_1234567890abcdef',
            state: 'APPLIED',
            started_at: '2026-01-01 00:00:00'
          }
        ];
      }
      return [];
    });

    const result = await ledgerReadService.evaluateLedgerStatus(baseline);
    expect(result.status).toBe('MIGRATION_CHECKSUM_MISMATCH');
    expect(result.reason).toContain('Checksum mismatch');
  });

  it('6. Rejects unknown applied migration in database', async () => {
    vi.spyOn(db, 'query').mockImplementation(async (sql) => {
      if (sql.includes('information_schema.COLUMNS')) return [{ COLUMN_NAME: 'state' }, { COLUMN_NAME: 'record_type' }];
      if (sql.includes('information_schema.TABLES')) return [{ TABLE_NAME: 'schema_versions' }];
      if (sql.includes('SELECT version, description')) {
        return [
          {
            version: '999_rogue_migration',
            description: '999_rogue_migration.sql',
            record_type: 'MIGRATION',
            migration_path: 'migrations/999_rogue_migration.sql',
            checksum: '0000000000000000000000000000000000000000000000000000000000000000',
            state: 'APPLIED',
            started_at: '2026-01-01 00:00:00'
          }
        ];
      }
      return [];
    });

    const result = await ledgerReadService.evaluateLedgerStatus(baseline);
    expect(result.status).toBe('MIGRATION_LEDGER_INCOMPATIBLE');
    expect(result.reason).toContain('Unknown applied migration in database');
  });
});
