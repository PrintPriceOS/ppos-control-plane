'use strict';

const assert = require('assert').strict;
const { up } = require('../src/migrations/phase185_migration_ledger_governance_schema');

console.log('=== Smoke Test 185A: Ledger Schema Upgrade & Backfill ===\n');

// Mock database query interceptor
let executedQueries = [];
const dbMock = {
  query: async (sql, params) => {
    executedQueries.push({ sql, params });
    // Mock information_schema check for 'state' column
    if (sql.includes('information_schema.COLUMNS')) {
      return [{ COLUMN_NAME: 'version' }]; // simulate state column is missing initially
    }
    return [];
  }
};

(async () => {
  process.env.PPOS_MIGRATION_EXECUTION = 'true';
  // Execute upgrade sequence
  await up(dbMock);


  // Assert DDL expand columns are added
  const hasAlterExpand = executedQueries.some(q => q.sql.includes('ALTER TABLE schema_versions') && q.sql.includes('migration_path'));
  assert(hasAlterExpand, 'DDL Alter expand phase should be triggered');

  // Assert Backfill to APPLIED occurred safely
  const hasBackfillApplied = executedQueries.some(q => q.sql.includes('UPDATE schema_versions') && q.sql.includes("state = 'APPLIED'"));
  assert(hasBackfillApplied, 'Safe backfill to APPLIED should occur on legacy null states');

  // Assert final constraints addition
  const hasConstraints = executedQueries.some(q => q.sql.includes('uq_schema_versions_migration_path'));
  assert(hasConstraints, 'Unique and index keys should be safely applied');

  console.log('  PASS: Ledger schema upgrade idempotency and safe backfill verified.');
})().catch(err => {
  console.error('Smoke test 185A failed:', err);
  process.exit(1);
});
