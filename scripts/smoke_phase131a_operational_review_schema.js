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

console.log('=== Smoke 131A: Operational Review Schema ===\n');

(async () => {
  const sqlFile = path.join(__dirname, '../migrations/079_phase131_controlled_beta_operational_review_exit_gate.sql');
  assert(fs.existsSync(sqlFile), 'Migration 079 exists');

  const sql = fs.readFileSync(sqlFile, 'utf8');
  assert(sql.includes('CREATE TABLE controlled_beta_operational_reviews'), 'Table reviews defined');
  assert(sql.includes('CREATE TABLE controlled_beta_operational_review_inputs'), 'Table inputs defined');
  assert(sql.includes('CREATE TABLE controlled_beta_operational_review_criteria'), 'Table criteria defined');
  assert(sql.includes('CREATE TABLE controlled_beta_operational_review_scores'), 'Table scores defined');
  assert(sql.includes('CREATE TABLE controlled_beta_operational_exit_criteria'), 'Table exit_criteria defined');
  assert(sql.includes('CREATE TABLE controlled_beta_operational_exit_decisions'), 'Table exit_decisions defined');
  assert(sql.includes('CREATE TABLE controlled_beta_operational_expansion_recommendations'), 'Table recommendations defined');
  assert(sql.includes('CREATE TABLE controlled_beta_operational_review_findings'), 'Table findings defined');
  assert(sql.includes('CREATE TABLE controlled_beta_operational_review_approvals'), 'Table approvals defined');
  assert(sql.includes('CREATE TABLE controlled_beta_operational_review_evidence_packs'), 'Table evidence_packs defined');
  assert(sql.includes('CREATE TABLE controlled_beta_operational_review_audits'), 'Table audits defined');

  assert(sql.includes('full_public_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'Safety defaults present');
  assert(sql.includes('manual_review_required TINYINT(1) NOT NULL DEFAULT 1'), 'manual_review_required defaults to 1');
  assert(sql.includes('auto_expansion_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'auto_expansion_enabled defaults to 0');
  assert(sql.includes('INDEX idx_cb_or_act'), 'Indexes exist');
  assert(!sql.includes('ADD COLUMN IF NOT EXISTS'), 'No unsupported ALTER TABLE');

  const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true';

  if (process.env.DATABASE_URL) {
    try {
      const tables = await db.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'controlled_beta_operational_%'");
      const tNames = tables.map(t => t.TABLE_NAME);
      assert(tNames.includes('controlled_beta_operational_reviews'), 'Tables exist in INFORMATION_SCHEMA.TABLES');
      
      const cols = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'controlled_beta_operational_reviews'");
      const cNames = cols.map(c => c.COLUMN_NAME);
      assert(cNames.includes('full_public_enabled'), 'Expected columns exist in INFORMATION_SCHEMA.COLUMNS');
      
      const idx = await db.query("SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'controlled_beta_operational_reviews'");
      const idxNames = idx.map(i => i.INDEX_NAME);
      assert(idxNames.includes('idx_cb_or_act'), 'Indexes exist in INFORMATION_SCHEMA.STATISTICS');

      const migrations = await db.query("SELECT * FROM schema_versions ORDER BY applied_at DESC LIMIT 50");
      const found = migrations.some(m => {
        const v = String(m.version || m.migration || m.migration_name || m.name || m.filename || m.description || '');
        return v.includes('079') || v.includes('phase131');
      });
      if (found) {
        assert(true, 'schema_versions contains migration 079');
      } else {
        assert(false, 'schema_versions contains migration 079');
        throw new Error('PHASE_131_MIGRATION_REGISTRY_MISSING');
      }
    } catch (e) {
      if (isProdLike && process.env.ALLOW_SCHEMA_SMOKE_FALLBACK !== 'true') {
        console.error('  FAIL: DB verification failed in production-like mode. ' + e.message);
        failed++;
      } else {
        console.log('  WARN: DB verification failed or not seeded. ' + e.message);
      }
    }
  }

  console.log(`\nSmoke 131A: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().then(() => {
  if (db && db.closePool) db.closePool();
}).catch(err => {
  console.error("FATAL ERROR in 131A:", err);
  process.exit(1);
});
