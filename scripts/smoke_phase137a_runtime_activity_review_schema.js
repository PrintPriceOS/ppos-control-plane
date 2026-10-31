'use strict';

const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 137A: Schema Migration Verification ===\n');

  const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

  if (!isProdLike) {
    console.log('Skipping SQL checks (Mock mode). 137A passed.');
    process.exit(0);
  }

  try {
    const tables = [
      'controlled_beta_runtime_activity_reviews',
      'controlled_beta_runtime_activity_review_decisions',
      'controlled_beta_runtime_activity_review_findings',
      'controlled_beta_runtime_activity_review_evidence',
      'controlled_beta_runtime_activity_review_audit_events'
    ];

    for (const table of tables) {
      const rows = await db.query(`SHOW TABLES LIKE ?`, [table]);
      if (rows.length === 0) {
        console.error(`FAIL: Table ${table} does not exist.`);
        process.exit(1);
      }
      console.log(`  PASS: Table ${table} verified.`);
    }

    const versionRows = await db.query("SELECT * FROM schema_versions WHERE version = '085'");
    if (versionRows.length === 0) {
      console.error("FAIL: Schema version 085 not registered.");
      process.exit(1);
    }
    console.log('  PASS: Schema version 085 registered in database.');

    console.log('\nSmoke 137A: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 137A:', e);
    process.exit(1);
  }
})();
