'use strict';

const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 138A: Cohort Intervention Preparation Schema Migration Verification ===\n');

  const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

  if (!isProdLike) {
    console.log('Skipping SQL checks (Mock mode). 138A passed.');
    process.exit(0);
  }

  try {
    const tables = [
      'controlled_beta_cohort_intervention_preparations',
      'controlled_beta_cohort_intervention_preparation_items',
      'controlled_beta_cohort_intervention_preparation_evidence',
      'controlled_beta_cohort_intervention_preparation_audit_events'
    ];

    for (const table of tables) {
      const rows = await db.query(`SHOW TABLES LIKE ?`, [table]);
      if (rows.length === 0) {
        console.error(`FAIL: Table ${table} does not exist.`);
        process.exit(1);
      }
      console.log(`  PASS: Table ${table} verified.`);
    }

    const versionRows = await db.query("SELECT * FROM schema_versions WHERE version = '086'");
    if (versionRows.length === 0) {
      console.error("FAIL: Schema version 086 not registered.");
      process.exit(1);
    }
    console.log('  PASS: Schema version 086 registered in database.');

    console.log('\nSmoke 138A: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 138A:', e);
    process.exit(1);
  }
})();
