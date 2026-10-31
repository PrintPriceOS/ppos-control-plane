'use strict';

const assert = require('assert').strict;
const ledgerWrite = require('../src/api/services/migrationLedgerWriteService');

console.log('=== Smoke Test 185B: Ledger State Machine transitions ===\n');

let executedQueries = [];
const dbMock = require('../src/api/services/mysqlClient');
dbMock.query = async (sql, params) => {
  executedQueries.push({ sql, params });
  return [];
};

(async () => {
  const executionId = 'test-uuid-12345';
  
  // 1. STARTED transition
  await ledgerWrite.markStarted({
    migrationPath: 'migrations/001_test.sql',
    checksum: 'hash-123',
    executionId,
    runnerId: 'runner-test'
  });
  
  const startedRecord = executedQueries.find(q => q.sql.includes('INSERT INTO schema_versions') && q.sql.includes('STARTED'));
  assert(startedRecord, 'Should insert STARTED record to database');
  assert.equal(startedRecord.params[2], 'hash-123');

  // 2. APPLIED transition
  executedQueries = [];
  await ledgerWrite.markApplied({
    executionId,
    executionTimeMs: 150
  });

  const appliedRecord = executedQueries.find(q => q.sql.includes('state = \'APPLIED\''));
  assert(appliedRecord, 'Should update record to APPLIED state');
  assert.equal(appliedRecord.params[0], 150);

  // 3. FAILED transition
  executedQueries = [];
  const errorMock = new Error('SQL syntax error on INSERT INTO users VALUES ("secret-seed-here")');
  await ledgerWrite.markFailed({
    executionId,
    executionTimeMs: 250,
    error: errorMock,
    statementIndex: 3,
    sqlStatement: 'INSERT INTO users VALUES ("secret-seed-here")'
  });

  const failedRecord = executedQueries.find(q => q.sql.includes('state = \'FAILED\''));
  assert(failedRecord, 'Should update record to FAILED state');
  assert.equal(failedRecord.params[1], 'MIGRATION_ERROR');
  // Check sanitization: no row seed data allowed in logs/messages
  assert(failedRecord.params[2].includes('VALUES (...)'), 'Should sanitize insert seed values');
  // Check SQL fingerprinting: no raw sql stored in description field
  assert(failedRecord.params[4].includes('SQL Fingerprint: '), 'Should store query fingerprint only');

  console.log('  PASS: Ledger state machine transitions and credential sanitization verified.');
})().catch(err => {
  console.error('Smoke test 185B failed:', err);
  process.exit(1);
});
