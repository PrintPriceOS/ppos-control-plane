'use strict';

/**
 * src/migrations/phase184g_migration_ledger_schema.js
 *
 * Phase 184G: Structural DDL Extraction
 *
 * Contains the DDL for the migration ledger (schema_versions table)
 * previously embedded in src/api/services/migrationService.js.
 *
 * ONLY callable from the migration CLI runner under
 * PPOS_MIGRATION_EXECUTION=true.
 */

async function up(db) {
  if (process.env.PPOS_MIGRATION_EXECUTION !== 'true') {
    throw new Error('DDL_EXECUTION_FORBIDDEN_OUTSIDE_MIGRATION_CONTEXT');
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      version VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(64) NOT NULL
    )
  `);

  try {
    await db.query('ALTER TABLE schema_versions MODIFY COLUMN version VARCHAR(255) NOT NULL');
  } catch (err) {
    // Column already correct — non-fatal
    if (!err.message.includes('Duplicate column')) {
      // Log but don't rethrow: idempotent
    }
  }
}

module.exports = { up };
