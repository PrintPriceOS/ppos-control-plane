'use strict';

const fs = require('fs');
const path = require('path');

/**
 * src/migrations/phase185_migration_ledger_governance_schema.js
 *
 * Phase 185: Migration Ledger Governance Wrapper
 *
 * Safe schema upgrade wrapper for schema_versions.
 * Invocable only in migration execution contexts.
 */

async function up(db) {
  if (process.env.PPOS_MIGRATION_EXECUTION !== 'true') {
    throw new Error('DDL_EXECUTION_FORBIDDEN_OUTSIDE_MIGRATION_CONTEXT');
  }

  // Idempotently add the new ledger columns as nullable so the runner can start writing to them.
  // The actual backfill and constraints are safely handled by the SQL migration file 135_phase185.
  await db.query(`
    ALTER TABLE schema_versions
      ADD COLUMN record_type ENUM('MIGRATION', 'BASELINE_MARKER', 'PHASE_MARKER') NOT NULL DEFAULT 'MIGRATION',
      ADD COLUMN migration_path VARCHAR(512) NULL,
      ADD COLUMN state ENUM('STARTED', 'APPLIED', 'FAILED') NULL,
      ADD COLUMN execution_id CHAR(36) NULL,
      ADD COLUMN runner_id VARCHAR(255) NULL,
      ADD COLUMN repository_commit CHAR(40) NULL,
      ADD COLUMN normalization VARCHAR(32) NOT NULL DEFAULT 'utf8-lf-v1',
      ADD COLUMN started_at DATETIME(3) NULL,
      ADD COLUMN heartbeat_at DATETIME(3) NULL,
      ADD COLUMN failed_at DATETIME(3) NULL,
      ADD COLUMN execution_time_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
      ADD COLUMN failure_code VARCHAR(128) NULL,
      ADD COLUMN failure_message TEXT NULL,
      ADD COLUMN failed_statement_index INT NULL
  `).catch(err => {

    // Ignore duplicate column errors
    if (err.code === 'ER_DUP_FIELDNAME' || err.errno === 1060) {
      return;
    }
    throw err;
  });
}


module.exports = { up };
