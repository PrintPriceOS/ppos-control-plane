'use strict';

const assert = require('assert').strict;
const ledgerRead = require('../src/api/services/migrationLedgerReadService');

console.log('=== Smoke Test 185C: Ledger Checksum Verification & Mismatch Block ===\n');

const dbMock = require('../src/api/services/mysqlClient');

const baselineMock = {
  migrations: [
    { path: 'migrations/001_create_schema_version.sql', canonicalSha256: 'hash-abc-ok' },
    { path: 'migrations/002_other_migration.sql', canonicalSha256: 'hash-xyz-ok' }
  ]
};

(async () => {
  // Test A: Checksum Mismatch
  dbMock.query = async (sql) => {
    if (sql.includes('information_schema.TABLES')) return [{ TABLE_NAME: 'schema_versions' }];
    if (sql.includes('information_schema.COLUMNS')) return [{ COLUMN_NAME: 'state' }];
    if (sql.includes('FROM schema_versions')) {
      return [
        { migration_path: 'migrations/001_create_schema_version.sql', checksum: 'hash-abc-BAD', state: 'APPLIED' }
      ];
    }
    return [];
  };

  let status = await ledgerRead.evaluateLedgerStatus(baselineMock);
  assert.equal(status.status, 'MIGRATION_CHECKSUM_MISMATCH', 'Should report mismatch on modified query checksum');
  console.log('  PASS: Checksum mismatch successfully detected and blocked.');

  // Test B: Unknown database migration
  dbMock.query = async (sql) => {
    if (sql.includes('information_schema.TABLES')) return [{ TABLE_NAME: 'schema_versions' }];
    if (sql.includes('information_schema.COLUMNS')) return [{ COLUMN_NAME: 'state' }];
    if (sql.includes('FROM schema_versions')) {
      return [
        { migration_path: 'migrations/999_unknown_migration.sql', checksum: 'hash-999', state: 'APPLIED' }
      ];
    }
    return [];
  };

  status = await ledgerRead.evaluateLedgerStatus(baselineMock);
  assert.equal(status.status, 'MIGRATION_LEDGER_INCOMPATIBLE', 'Should report incompatibility on untracked db migrations');
  console.log('  PASS: Unknown database migration successfully detected and blocked.');

  // Test C: Stale STARTED migration
  dbMock.query = async (sql) => {
    if (sql.includes('information_schema.TABLES')) return [{ TABLE_NAME: 'schema_versions' }];
    if (sql.includes('information_schema.COLUMNS')) return [{ COLUMN_NAME: 'state' }];
    if (sql.includes('FROM schema_versions')) {
      return [
        { 
          migration_path: 'migrations/002_other_migration.sql', 
          checksum: 'hash-xyz-ok', 
          state: 'STARTED',
          started_at: new Date(Date.now() - 40 * 60 * 1000) // 40 minutes ago (stale)
        }
      ];
    }
    return [];
  };


  status = await ledgerRead.evaluateLedgerStatus(baselineMock);
  assert.equal(status.status, 'MIGRATION_FAILED', 'Should block on stale STARTED migrations');
  assert(status.reason.includes('Stale started execution detected'), 'Should describe the stale run');
  console.log('  PASS: Stale execution successfully detected and blocked.');

})().catch(err => {
  console.error('Smoke test 185C failed:', err);
  process.exit(1);
});
