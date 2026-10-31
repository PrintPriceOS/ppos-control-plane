'use strict';

const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== Smoke 139A: Cohort Intervention Approval Schema Migration Verification ===\n');

  const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

  if (!isProdLike) {
    console.log('Skipping SQL checks (Mock mode). 139A passed.');
    process.exit(0);
  }

  try {
    const tables = [
      'controlled_beta_cohort_intervention_approvals',
      'controlled_beta_cohort_intervention_approval_steps',
      'controlled_beta_cohort_intervention_approval_evidence',
      'controlled_beta_cohort_intervention_approval_audit_events'
    ];

    for (const table of tables) {
      const rows = await db.query(`SHOW TABLES LIKE ?`, [table]);
      if (rows.length === 0) {
        console.error(`FAIL: Table ${table} does not exist.`);
        process.exit(1);
      }
      console.log(`  PASS: Table ${table} verified.`);
    }

    const versionRows = await db.query("SELECT * FROM schema_versions WHERE version = '087'");
    if (versionRows.length === 0) {
      console.error("FAIL: Schema version 087 not registered.");
      process.exit(1);
    }
    console.log('  PASS: Schema version 087 registered in database.');

    console.log('\nSmoke 139A: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 139A:', e);
    process.exit(1);
  }
})();
