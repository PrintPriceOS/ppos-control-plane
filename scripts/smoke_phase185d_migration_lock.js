'use strict';

// Clear environment variables to isolate from real database pool
delete process.env.DATABASE_URL;
delete process.env.MYSQL_HOST;
delete process.env.MYSQL_USER;
delete process.env.MYSQL_PASSWORD;
delete process.env.MYSQL_DATABASE;

const dbMock = require('../src/api/services/mysqlClient');

let acquiredLocks = [];
let releasedLocks = [];

const originalGetPool = dbMock.getPool;

const mockConnection = {
  query: async (sql, params) => {
    if (sql.includes('GET_LOCK')) {
      acquiredLocks.push(params[0]);
      return [[{ is_locked: 1 }], []];
    }
    if (sql.includes('RELEASE_LOCK')) {
      releasedLocks.push(params[0]);
      return [[{ is_released: 1 }], []];
    }

    if (sql.includes('information_schema.TABLES')) return [[{ TABLE_NAME: 'schema_versions' }]];
    if (sql.includes('information_schema.COLUMNS')) return [[{ COLUMN_NAME: 'state' }]];
    if (sql.includes('SELECT migration_path')) return [[]];
    if (sql.includes('SELECT version, description')) return [[]];
    return [[]];
  },
  release: () => {}
};

dbMock.getPool = () => {
  return {
    getConnection: async () => mockConnection
  };
};

const { MigrationService } = require('../src/api/services/migrationService');

const assert = require('assert').strict;

(async () => {
  process.env.PPOS_MIGRATION_EXECUTION = 'true';
  const service = new MigrationService();

  // Trigger migration run
  // This will try to acquire lock and execute
  await service.runMigrations().catch(e => {
    // We expect it might fail on empty migrations scan in mock context, but check if lock logic runs
  });

  assert(acquiredLocks.includes('ppos-control-plane:migrations'), 'Should acquire advisory lock before database preflights');
  assert(releasedLocks.includes('ppos-control-plane:migrations'), 'Should always release advisory lock inside finally block');

  console.log('  PASS: Advisory locks successfully acquired and released on run.');
  dbMock.getPool = originalGetPool;
})().catch(err => {
  console.error('Smoke test 185D failed:', err);
  process.exit(1);
});

