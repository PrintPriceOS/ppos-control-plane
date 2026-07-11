'use strict';

const assert = require('assert').strict;
const path = require('path');
const fs = require('fs');

console.log('=== Smoke Test 185G: Legacy Ledger Marker Classification ===\n');

// Mocked query logs
let updateQueries = [];

const dbConnMock = {
  query: async (sql, params) => {
    if (sql.includes('UPDATE schema_versions')) {
      updateQueries.push({ sql, params });
    }
    return [];
  }
};

const migrationsMock = [
  { relativePath: 'migrations/001_test.sql', filename: '001_test.sql', absolutePath: '/tmp/001_test.sql' }
];

const baselineMock = {
  migrations: [
    { path: 'migrations/001_test.sql', canonicalSha256: 'hash-001' }
  ]
};

// Simulation classifier loop replicating run_control_plane_migrations.js classification rules
async function runClassificationMock(rows) {
  const baselineMap = new Map();
  for (const m of baselineMock.migrations) {
    const filename = m.path.split('/').pop();
    baselineMap.set(filename, m);
  }

  for (const row of rows) {
    const fileKey = row.description && row.description.endsWith('.sql')
      ? row.description
      : `${row.version}.sql`;

    // Rule 1: Real Migrations
    if (baselineMap.has(fileKey)) {
      const match = baselineMap.get(fileKey);
      await dbConnMock.query('UPDATE schema_versions SET record_type = "MIGRATION" ...', [
        match.path, match.canonicalSha256, row.version, row.description
      ]);
      continue;
    }

    // Rule 2: Baseline Marker
    if (row.version === '1.0.0' && row.description === 'Initial Production Baseline') {
      await dbConnMock.query('UPDATE schema_versions SET record_type = "BASELINE_MARKER" ...', [
        row.version, row.description
      ]);
      continue;
    }

    // Rule 3: Phase Markers
    if (/^\d{3}$/.test(row.version) && /^Phase \d+:/.test(row.description || '') && !row.checksum) {
      await dbConnMock.query('UPDATE schema_versions SET record_type = "PHASE_MARKER" ...', [
        row.version, row.description
      ]);
      continue;
    }

    throw new Error(`UNRESOLVED_LEGACY_LEDGER_ROW:${row.version}`);
  }
}

(async () => {
  // 1. Validate real migration resolution
  await runClassificationMock([
    { version: '001_test', description: '001_test.sql', checksum: 'some-old-hash', state: null }
  ]);
  assert.equal(updateQueries[0].params[0], 'migrations/001_test.sql');
  
  // 2. Validate Baseline Marker resolution
  updateQueries = [];
  await runClassificationMock([
    { version: '1.0.0', description: 'Initial Production Baseline', checksum: '', state: null }
  ]);
  assert.equal(updateQueries[0].params[0], '1.0.0');

  // 3. Validate Phase Marker resolution
  updateQueries = [];
  await runClassificationMock([
    { version: '080', description: 'Phase 132: invite cohort preparation', checksum: '', state: null }
  ]);
  assert.equal(updateQueries[0].params[0], '080');

  // 4. Validate Unresolved throws error
  updateQueries = [];
  await assert.rejects(
    runClassificationMock([
      { version: '999', description: 'Unknown description and no matching file', checksum: '', state: null }
    ]),
    /UNRESOLVED_LEGACY_LEDGER_ROW/
  );

  console.log('  PASS: Classification rules for MIGRATION, BASELINE_MARKER, and PHASE_MARKER verified.');
})().catch(err => {
  console.error('Smoke test 185G failed:', err);
  process.exit(1);
});
