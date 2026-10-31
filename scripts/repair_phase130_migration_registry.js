'use strict';

require('dotenv').config();
const db = require('../src/api/services/mysqlClient');

console.log('=== Phase 130 Migration Registry Repair ===\n');

(async () => {
  if (!process.env.DATABASE_URL && !process.env.MYSQL_HOST) {
    console.log('WARN: Real DB not configured. Skipping registry repair.');
    process.exit(0);
  }

  try {
    // 1. Verify schema_versions exists
    const schemaVersionsTables = await db.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_versions'");
    if (schemaVersionsTables.length === 0) {
      console.error('FAIL: schema_versions table does not exist.');
      process.exit(1);
    }

    // 2. Verify Phase 130 tables exist
    const phase130Tables = await db.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'controlled_beta_runtime_%'");
    const tNames = phase130Tables.map(t => t.TABLE_NAME);
    if (!tNames.includes('controlled_beta_runtime_observation_sessions')) {
      console.error('FAIL: Phase 130 tables are missing. Aborting registry repair.');
      process.exit(1);
    }

    // 3. Verify columns exist (especially the one added in 078)
    const cols = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'controlled_beta_runtime_observation_sessions'");
    const cNames = cols.map(c => c.COLUMN_NAME);
    if (!cNames.includes('full_public_enabled') || !cNames.includes('event_type')) {
      console.error('FAIL: Required Phase 130 columns are missing. Aborting registry repair.');
      process.exit(1);
    }

    // 4. Verify indexes exist
    const idx = await db.query("SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'controlled_beta_runtime_observation_sessions'");
    const idxNames = idx.map(i => i.INDEX_NAME);
    if (!idxNames.includes('idx_cb_obs_sess_act')) {
      console.error('FAIL: Required Phase 130 indexes are missing. Aborting registry repair.');
      process.exit(1);
    }

    // 5. Determine which column schema_versions uses
    const svCols = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_versions'");
    const svColNames = svCols.map(c => c.COLUMN_NAME);
    
    let targetCol = null;
    if (svColNames.includes('version')) targetCol = 'version';
    else if (svColNames.includes('migration')) targetCol = 'migration';
    else if (svColNames.includes('name')) targetCol = 'name';
    else if (svColNames.includes('migration_name')) targetCol = 'migration_name';
    else if (svColNames.includes('filename')) targetCol = 'filename';
    else if (svColNames.includes('description')) targetCol = 'description';

    if (!targetCol) {
      console.error('FAIL: Could not determine identifier column in schema_versions.');
      process.exit(1);
    }

    // 6. Check if 077 or 078 is already registered
    const existing = await db.query(`SELECT * FROM schema_versions ORDER BY applied_at DESC LIMIT 50`);
    const found = existing.some(m => {
      const v = String(m[targetCol] || '');
      return v.includes('077') || v.includes('078') || v.includes('phase130');
    });

    if (found) {
      console.log('PASS: Migration registry already contains Phase 130 records. No repair needed.');
    } else {
      // 7. Insert the missing registry row
      const value = '078_phase130_0_1_runtime_observation_schema_alignment';
      await db.query(`INSERT INTO schema_versions (${targetCol}) VALUES (?)`, [value]);
      console.log(`PASS: Repaired migration registry. Inserted ${value} into ${targetCol}.`);
    }

  } catch (err) {
    console.error('FAIL: Registry repair error:', err.message);
    process.exit(1);
  } finally {
    if (db && db.closePool) await db.closePool();
  }

  process.exit(0);
})();
