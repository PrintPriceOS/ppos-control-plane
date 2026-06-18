'use strict';

/**
 * scripts/diagnose_migration_integrity_drift.js
 * Diagnoses migration checksum drift for 015_stripe_webhook_events_idempotency.
 * Read-only — never mutates the database.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const TARGET_VERSION = '015_stripe_webhook_events_idempotency';
const TARGET_FILE = 'migrations/015_stripe_webhook_events_idempotency.sql';

function computeChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function diagnose() {
  console.log('\n━━━ Migration Integrity Drift Diagnostic ━━━\n');

  const filePath = path.resolve(__dirname, '..', TARGET_FILE);
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: Migration file not found: ${TARGET_FILE}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const currentChecksum = computeChecksum(fileContent);

  console.log(`Target version:    ${TARGET_VERSION}`);
  console.log(`Target file:       ${TARGET_FILE}`);
  console.log(`Current checksum:  ${currentChecksum}`);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL not set.');
    process.exit(1);
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbUrl);

    const [rows] = await connection.execute(
      'SELECT version, description, applied_at, checksum FROM schema_versions WHERE version = ? OR description LIKE ?',
      [TARGET_VERSION, `%${TARGET_VERSION}%`]
    );

    if (rows.length === 0) {
      console.log('\nNo schema_versions row found for this migration.');
      console.log('The migration may not have been applied yet.');
    } else {
      for (const row of rows) {
        console.log('\n─── schema_versions row ───');
        console.log(`  version:         ${row.version}`);
        console.log(`  description:     ${row.description || '(null)'}`);
        console.log(`  applied_at:      ${row.applied_at}`);
        console.log(`  stored checksum: ${row.checksum}`);
        console.log(`  current checksum:${currentChecksum}`);
        console.log(`  match:           ${row.checksum === currentChecksum}`);
      }
    }

    // Also check for version collision with 015-prefix migrations
    console.log('\n─── All 015-prefix schema_versions rows ───');
    const [all015] = await connection.execute(
      "SELECT version, description, checksum FROM schema_versions WHERE version LIKE '015%' OR version = '015'"
    );
    for (const row of all015) {
      console.log(`  version=${row.version}  description=${row.description || '(null)'}  checksum=${row.checksum.substring(0, 16)}...`);
    }

  } catch (err) {
    console.error('Database error:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }

  console.log('\n━━━ Diagnostic complete. No database mutations performed. ━━━\n');
}

diagnose().catch(err => {
  console.error('Diagnostic crashed:', err.message);
  process.exit(1);
});
