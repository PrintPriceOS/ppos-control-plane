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

  const sqlPath = path.join(__dirname, '../../migrations/135_phase185_migration_ledger_governance.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');

  // Basic SQL statements splitter
  const statements = sqlContent
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const sql of statements) {
    try {
      await db.query(sql);
    } catch (err) {
      // Ignore duplicate column, key, or constraint errors for idempotency
      const ignoreCodes = ['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_DUP_INDEX', 'ER_MULTIPLE_PRI_KEY'];
      if (ignoreCodes.includes(err.code) || err.errno === 1060 || err.errno === 1061 || err.errno === 1068) {
        continue;
      }
      throw err;
    }
  }
}

module.exports = { up };
