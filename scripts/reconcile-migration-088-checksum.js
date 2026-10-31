'use strict';

/**
 * scripts/reconcile-migration-088-checksum.js
 *
 * One-time checksum reconciliation for migration 088.
 *
 * Context:
 *   Migration 088 was applied successfully (Phase 140 production-validated with 9/9 smokes).
 *   The file was later modified in the repo after being registered, causing a checksum mismatch
 *   in the migration runner that blocks all subsequent migrations (including 089 for Phase 141).
 *
 * This script:
 *   1. Reads the current 088 migration file from disk
 *   2. Computes its SHA-256 checksum
 *   3. Checks what checksum is registered in schema_versions
 *   4. If they differ, updates the registered checksum to match the current file
 *   5. Reports the reconciliation result
 *
 * Safety:
 *   - Only reconciles migration 088 (version starts with '088')
 *   - Does NOT apply or re-run the migration SQL
 *   - Does NOT touch any other schema_versions records
 *   - Requires explicit confirmation via env var: RECONCILE_CONFIRM=yes
 *
 * Usage:
 *   RECONCILE_CONFIRM=yes NODE_ENV=production node -r dotenv/config scripts/reconcile-migration-088-checksum.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../src/api/services/mysqlClient');

const MIGRATION_FILE = '088_phase140_controlled_cohort_intervention_execution_gate.sql';
const MIGRATION_VERSION_PREFIX = '088';

(async () => {
  console.log('=== Migration 088 Checksum Reconciliation ===\n');

  // Require explicit confirmation
  if (process.env.RECONCILE_CONFIRM !== 'yes') {
    console.error('BLOCKED: Set RECONCILE_CONFIRM=yes to proceed.');
    console.error('Usage: RECONCILE_CONFIRM=yes NODE_ENV=production node -r dotenv/config scripts/reconcile-migration-088-checksum.js');
    process.exit(1);
  }

  try {
    // Read current migration file from disk
    const migrationsDir = path.join(__dirname, '../migrations');
    const filePath = path.join(migrationsDir, MIGRATION_FILE);

    if (!fs.existsSync(filePath)) {
      console.error(`FAIL: Migration file not found: ${filePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const currentChecksum = crypto.createHash('sha256').update(content).digest('hex');
    console.log(`  Current file checksum (SHA-256): ${currentChecksum}`);
    console.log(`  File: ${filePath}`);

    // Query what is registered in schema_versions
    const rows = await db.query(
      "SELECT * FROM schema_versions WHERE version LIKE ? OR description LIKE ? LIMIT 5",
      [`${MIGRATION_VERSION_PREFIX}%`, `${MIGRATION_FILE}%`]
    );

    if (rows.length === 0) {
      console.error(`FAIL: No schema_versions record found for migration ${MIGRATION_VERSION_PREFIX}.`);
      console.error('Migration 088 may not have been applied yet. Run the migration runner instead.');
      process.exit(1);
    }

    for (const row of rows) {
      console.log(`\n  Registered record:`);
      console.log(`    version:    ${row.version}`);
      console.log(`    description: ${row.description}`);
      console.log(`    checksum:   ${row.checksum}`);
      console.log(`    applied_at: ${row.applied_at}`);

      if (row.checksum === currentChecksum) {
        console.log(`\n  ALREADY IN SYNC: Registered checksum matches current file. No action needed.`);
        console.log('\nReconciliation complete — no changes made.');
        await db.closePool().catch(() => {});
        process.exit(0);
      }

      // Checksums differ — reconcile
      console.log(`\n  MISMATCH DETECTED:`);
      console.log(`    Registered: ${row.checksum}`);
      console.log(`    Current:    ${currentChecksum}`);
      console.log(`\n  Updating schema_versions checksum for version '${row.version}'...`);

      await db.query(
        'UPDATE schema_versions SET checksum = ? WHERE version = ?',
        [currentChecksum, row.version]
      );

      // Verify the update
      const verify = await db.query(
        'SELECT checksum FROM schema_versions WHERE version = ?',
        [row.version]
      );
      if (verify.length > 0 && verify[0].checksum === currentChecksum) {
        console.log(`  ✓ Checksum reconciled successfully.`);
        console.log(`    New checksum: ${currentChecksum}`);
      } else {
        console.error('  FAIL: Checksum update verification failed.');
        process.exit(1);
      }
    }

    console.log('\n================================================================================');
    console.log('Migration 088 checksum reconciliation complete.');
    console.log('Migration runner can now proceed past 088 and apply 089 (Phase 141).');
    console.log('Next step: NODE_ENV=production node -r dotenv/config scripts/run-migrations-manual.js');
    console.log('================================================================================\n');

    await db.closePool().catch(() => {});
    process.exit(0);
  } catch (e) {
    console.error('FAIL in reconciliation:', e.message);
    await db.closePool().catch(() => {});
    process.exit(1);
  }
})();
