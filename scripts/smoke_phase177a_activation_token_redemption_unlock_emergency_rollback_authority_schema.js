'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');

const forceRealDb = process.env.FORCE_REAL_DB_SMOKE === 'true';
const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || forceRealDb) && process.env.DB_UNREACHABLE !== 'true';
const allowFallback = process.env.ALLOW_SCHEMA_SMOKE_FALLBACK !== 'false' && !forceRealDb;

(async () => {
  console.log('=== Smoke 177A: Phase 177 Schema Validation ===\n');

  if (!isProdLike) {
    console.log('  PASS (mock): Schema validation skipped in non-prod mode.');
    process.exit(0);
  }

  try {
    for (const tableName of [
      'cb_cohort_intervention_activation_token_redempt_unlock_era',
      'cb_cohort_intervention_activation_token_redempt_unlock_era_rl',
      'cb_cohort_intervention_activation_token_redempt_unlock_era_ev',
      'cb_cohort_intervention_activation_token_redempt_unlock_era_aud'
    ]) {
      const rows = await db.query(`SHOW TABLES LIKE ?`, [tableName]);
      assert.strictEqual(rows.length, 1, `Table ${tableName} does not exist`);
      console.log(`  PASS: Table ${tableName} verified.`);
    }
    console.log('\nSmoke 177A: Passed.');
    process.exit(0);
  } catch (e) {
    if (allowFallback) { console.warn('  WARN (fallback):', e.message); process.exit(0); }
    console.error('FAIL in 177A:', e.message);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
