'use strict';

/**
 * scripts/repair_phase120_1_migration_015_checksum.js
 * Guarded repair for migration 015_stripe_webhook_events_idempotency checksum drift.
 * Only updates the checksum column — never re-runs the migration.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const mysql = require('mysql2/promise');

const TARGET_VERSION = '015_stripe_webhook_events_idempotency';
const TARGET_FILE = 'migrations/015_stripe_webhook_events_idempotency.sql';

function computeChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function repair() {
  console.log('\n━━━ Phase 120.1 — Migration 015 Checksum Repair ━━━\n');

  // Guard: require explicit env flag
  if (process.env.ALLOW_MIGRATION_CHECKSUM_REPAIR !== 'true') {
    console.error('REFUSED: ALLOW_MIGRATION_CHECKSUM_REPAIR is not set to "true".');
    console.error('Set ALLOW_MIGRATION_CHECKSUM_REPAIR=true to authorize this repair.');
    process.exit(1);
  }

  const filePath = path.resolve(__dirname, '..', TARGET_FILE);

  // Guard: migration file must exist
  if (!fs.existsSync(filePath)) {
    console.error(`REFUSED: Migration file not found: ${TARGET_FILE}`);
    process.exit(1);
  }

  // Guard: git working tree must be clean for this file
  try {
    const gitDiff = execSync(`git diff -- ${TARGET_FILE}`, { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
    const gitDiffStaged = execSync(`git diff --staged -- ${TARGET_FILE}`, { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
    if (gitDiff.trim().length > 0 || gitDiffStaged.trim().length > 0) {
      console.error(`REFUSED: Git working tree is dirty for ${TARGET_FILE}.`);
      console.error('Commit or stash changes before running this repair.');
      process.exit(1);
    }
  } catch (err) {
    console.warn('WARNING: Could not verify git status. Proceeding with caution.');
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const newChecksum = computeChecksum(fileContent);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('REFUSED: DATABASE_URL not set.');
    process.exit(1);
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbUrl);

    // Find existing row
    const [rows] = await connection.execute(
      'SELECT id, version, description, applied_at, checksum FROM schema_versions WHERE version = ? OR description LIKE ?',
      [TARGET_VERSION, `%${TARGET_VERSION}%`]
    );

    if (rows.length === 0) {
      console.error(`REFUSED: No schema_versions row found for version ${TARGET_VERSION}.`);
      console.error('Cannot repair a migration that has not been applied.');
      process.exit(1);
    }

    const row = rows[0];
    const oldChecksum = row.checksum;

    if (oldChecksum === newChecksum) {
      console.log('No repair needed — checksums already match.');
      console.log(`  version:  ${row.version}`);
      console.log(`  checksum: ${oldChecksum}`);
      process.exit(0);
    }

    // Perform the single-row checksum update
    await connection.execute(
      'UPDATE schema_versions SET checksum = ? WHERE id = ?',
      [newChecksum, row.id]
    );

    const repairedAt = new Date().toISOString();

    console.log('─── Repair Audit Summary ───');
    console.log(`  version:      ${row.version}`);
    console.log(`  description:  ${row.description || '(null)'}`);
    console.log(`  old checksum: ${oldChecksum}`);
    console.log(`  new checksum: ${newChecksum}`);
    console.log(`  repaired_at:  ${repairedAt}`);
    console.log(`  reason:       checksum repair after already-applied migration file normalization / historical drift`);

    // Attempt audit table write
    try {
      await connection.execute(
        `INSERT INTO audit_logs (event_type, entity_type, entity_id, details, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          'MIGRATION_CHECKSUM_REPAIR',
          'schema_versions',
          String(row.id),
          JSON.stringify({
            version: row.version,
            description: row.description,
            old_checksum: oldChecksum,
            new_checksum: newChecksum,
            repaired_at: repairedAt,
            reason: 'checksum repair after already-applied migration file normalization / historical drift'
          })
        ]
      );
      console.log('  audit:        Written to audit_logs table.');
    } catch (auditErr) {
      console.log('  audit:        Audit persistence skipped (audit table not available).');
    }

    console.log('\n━━━ Repair complete. Only checksum was updated. Migration was NOT re-run. ━━━\n');

  } catch (err) {
    console.error('Repair failed:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

repair().catch(err => {
  console.error('Repair crashed:', err.message);
  process.exit(1);
});
