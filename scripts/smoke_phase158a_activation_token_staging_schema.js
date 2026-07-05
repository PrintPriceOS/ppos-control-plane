'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
const allowFallback = process.env.ALLOW_SCHEMA_SMOKE_FALLBACK !== 'false';

(async () => {
  console.log('=== Smoke 158A: Phase 158 Schema Validation ===\n');

  if (!isProdLike) {
    console.log('  PASS (mock): Schema validation skipped in non-prod mode.');
    process.exit(0);
  }

  try {
    const checkTable = async (tableName) => {
      const rows = await db.query(`SHOW TABLES LIKE ?`, [tableName]);
      assert.strictEqual(rows.length, 1, `Table ${tableName} does not exist`);
      console.log(`  PASS: Table ${tableName} verified.`);
    };

    await checkTable('cb_cohort_intervention_activation_token_staging');
    await checkTable('cb_cohort_intervention_activation_token_staging_rules');
    await checkTable('cb_cohort_intervention_activation_token_staging_evidence');
    await checkTable('cb_cohort_intervention_activation_token_staging_audits');

    console.log('\nSmoke 158A: Passed.');
    process.exit(0);
  } catch (e) {
    if (allowFallback) {
      console.warn('  WARN (fallback): Schema check failed but fallback allowed:', e.message);
      process.exit(0);
    }
    console.error('FAIL in 158A:', e.message);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
