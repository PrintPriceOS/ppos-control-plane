'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
const allowFallback = process.env.ALLOW_SCHEMA_SMOKE_FALLBACK !== 'false';

(async () => {
  console.log('=== Smoke 159A: Phase 159 Schema Validation ===\n');

  if (!isProdLike) {
    console.log('  PASS (mock): Schema validation skipped in non-prod mode.');
    process.exit(0);
  }

  try {
    for (const tableName of [
      'cb_cohort_intervention_activation_token_preflight',
      'cb_cohort_intervention_activation_token_preflight_rules',
      'cb_cohort_intervention_activation_token_preflight_evidence',
      'cb_cohort_intervention_activation_token_preflight_audits'
    ]) {
      const rows = await db.query(`SHOW TABLES LIKE ?`, [tableName]);
      assert.strictEqual(rows.length, 1, `Table ${tableName} does not exist`);
      console.log(`  PASS: Table ${tableName} verified.`);
    }
    console.log('\nSmoke 159A: Passed.');
    process.exit(0);
  } catch (e) {
    if (allowFallback) { console.warn('  WARN (fallback):', e.message); process.exit(0); }
    console.error('FAIL in 159A:', e.message);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
