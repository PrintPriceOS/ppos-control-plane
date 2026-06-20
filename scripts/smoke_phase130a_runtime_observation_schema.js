'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/api/services/mysqlClient');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 130A: Runtime Observation Schema ===\n');

(async () => {
  const sqlFile = path.join(__dirname, '../migrations/077_phase130_controlled_beta_runtime_observation_monitoring.sql');
  assert(fs.existsSync(sqlFile), 'Migration 077 exists');
  
  const sql = fs.readFileSync(sqlFile, 'utf8');
  assert(sql.includes('controlled_beta_runtime_observation_sessions'), 'Sessions table defined');
  assert(sql.includes('full_public_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'Safety defaults present');
  assert(sql.includes('INDEX idx_cb_obs_sess_act'), 'Indexes defined');
  assert(!sql.includes('ADD COLUMN IF NOT EXISTS'), 'No unsupported ALTER TABLE');

  if (process.env.DATABASE_URL) {
    try {
      const [tables] = await db.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'controlled_beta_runtime_%'");
      const tNames = tables.map(t => t.TABLE_NAME);
      assert(tNames.includes('controlled_beta_runtime_observation_sessions'), 'Tables applied in real DB');
      
      const [cols] = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'controlled_beta_runtime_observation_sessions'");
      const cNames = cols.map(c => c.COLUMN_NAME);
      assert(cNames.includes('full_public_enabled'), 'Columns exist in real DB');
      
      const [idx] = await db.query("SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'controlled_beta_runtime_observation_sessions'");
      const idxNames = idx.map(i => i.INDEX_NAME);
      assert(idxNames.includes('idx_cb_obs_sess_act'), 'Indexes exist in real DB');
    } catch (e) {
      console.log('  WARN: DB verification failed or not seeded. ' + e.message);
    }
  }

  console.log(`\nSmoke 130A: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().then(() => db.closePool && db.closePool()).catch(err => {
  console.error("FATAL ERROR in 130A:", err);
  process.exit(1);
});
