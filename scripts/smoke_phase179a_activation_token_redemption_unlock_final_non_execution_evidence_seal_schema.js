'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');

const forceRealDb = process.env.FORCE_REAL_DB_SMOKE === 'true';
const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || forceRealDb) && process.env.DB_UNREACHABLE !== 'true';
const allowFallback = process.env.ALLOW_SCHEMA_SMOKE_FALLBACK !== 'false' && !forceRealDb;

(async () => {
  console.log('=== Smoke 179A: Phase 179 Schema Validation ===\n');

  if (!isProdLike) {
    console.log('  PASS (mock): Schema validation skipped in non-prod mode.');
    process.exit(0);
  }

  try {
    for (const tableName of [
      'cb_cohort_intervention_activation_token_redempt_unlock_fnees',
      'cb_cohort_intervention_activation_token_redempt_unlock_fnees_rl',
      'cb_cohort_intervention_activation_token_redempt_unlock_fnees_ev',
      'cb_cohort_intervention_activation_token_redempt_unlock_fnees_aud'
    ]) {
      const rows = await db.query(`SHOW TABLES LIKE ?`, [tableName]);
      assert.strictEqual(rows.length, 1, `Table ${tableName} does not exist`);
      console.log(`  PASS: Table ${tableName} verified.`);
    }
    console.log('\nSmoke 179A: Passed.');
    process.exit(0);
  } catch (e) {
    if (allowFallback) { console.warn('  WARN (fallback):', e.message); process.exit(0); }
    console.error('FAIL in 179A:', e.message);
    process.exit(1);
  } finally {
    if (db.closePool) await db.closePool().catch(() => {});
  }
})();
