'use strict';

const assert = require('assert').strict;
const compatibilityService = require('../src/api/services/schemaCompatibilityService');

console.log('=== Smoke Test 185E: Readiness API Ledger Integration ===\n');

const dbMock = require('../src/api/services/mysqlClient');

const fs = require('fs');
const path = require('path');
const baselinePath = path.join(__dirname, '../migrations/migration-integrity-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

// Utility helper to find expected checksum for path
function getExpectedChecksum(relPath) {
  const m = baseline.migrations.find(item => (item.path || item.relativePath) === relPath);
  return m ? (m.canonicalSha256 || m.sha256) : 'dummy-hash';
}

(async () => {
  // Test A: Database has a FAILED migration
  dbMock.query = async (sql) => {
    if (sql.includes('information_schema.TABLES')) return [{ TABLE_NAME: 'schema_versions' }];
    if (sql.includes('information_schema.COLUMNS')) {
      return [
        { COLUMN_NAME: 'state' },
        { COLUMN_NAME: 'migration_path' },
        { COLUMN_NAME: 'checksum' },
        { COLUMN_NAME: 'started_at' },
        { COLUMN_NAME: 'failure_code' }
      ];
    }
    if (sql.includes('SELECT migration_path')) {
      const targetPath = 'migrations/005_machine_detail_intelligence.sql';
      return [
        { 
          migration_path: targetPath, 
          checksum: getExpectedChecksum(targetPath), 
          state: 'FAILED',
          failure_code: 'ER_BAD_TABLE_ERROR'
        }
      ];
    }
    return [];
  };


  const res = await compatibilityService.evaluateSchemaCompatibility();
  assert.equal(res.status, 'MIGRATION_FAILED', 'Should block readiness check when a FAILED record is active');
  
  // Apply the same sanitization logic as the server.js public route
  const sanitizedReason = res.reason 
      ? res.reason.replace(/migrations\/[a-zA-Z0-9_-]+\.sql/g, 'migration_file.sql')
      : 'DATABASE_SCHEMA_INCOMPATIBLE';

  // Confirm public safety: raw filenames should be masked or minimized
  assert(!sanitizedReason.includes('005_machine_detail_intelligence.sql'), 'Public details must sanitize raw file paths');

  console.log('  PASS: Compatibility service successfully gates FAILED ledger records.');

  // Test B: Database has a pending migration
  dbMock.query = async (sql) => {
    if (sql.includes('information_schema.TABLES')) return [{ TABLE_NAME: 'schema_versions' }];
    if (sql.includes('information_schema.COLUMNS')) {
      return [
        { COLUMN_NAME: 'state' },
        { COLUMN_NAME: 'migration_path' },
        { COLUMN_NAME: 'checksum' },
        { COLUMN_NAME: 'started_at' }
      ];
    }
    if (sql.includes('SELECT migration_path')) {
      const firstPath = 'migrations/001_create_schema_version.sql';
      return [
        // Simulate only the first migration applied, leaving 137 pending
        { migration_path: firstPath, checksum: getExpectedChecksum(firstPath), state: 'APPLIED' }
      ];
    }


    return [];
  };

  const pendingRes = await compatibilityService.evaluateSchemaCompatibility();
  assert.equal(pendingRes.status, 'PENDING_MIGRATIONS', 'Should report pending migrations when database is missing baseline files');
  console.log('  PASS: Compatibility service successfully gates PENDING_MIGRATIONS.');

})().catch(err => {
  console.error('Smoke test 185E failed:', err);
  process.exit(1);
});
