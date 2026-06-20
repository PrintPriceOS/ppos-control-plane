'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/api/services/mysqlClient');

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 132A: Expansion Preparation Schema ===\n');

(async () => {
  const sqlFile = path.join(__dirname, '../migrations/080_phase132_controlled_invite_only_expansion_preparation_gate.sql');
  assert(fs.existsSync(sqlFile), 'Migration 080 exists');

  const sql = fs.readFileSync(sqlFile, 'utf8');
  assert(sql.includes('CREATE TABLE controlled_beta_expansion_preparation_gates'), 'Table controlled_beta_expansion_preparation_gates defined');
  assert(sql.includes('CREATE TABLE controlled_beta_expansion_preparation_inputs'), 'Table controlled_beta_expansion_preparation_inputs defined');
  assert(sql.includes('CREATE TABLE controlled_beta_expansion_scope_drafts'), 'Table controlled_beta_expansion_scope_drafts defined');
  assert(sql.includes('CREATE TABLE controlled_beta_expansion_capacity_assessments'), 'Table controlled_beta_expansion_capacity_assessments defined');
  assert(sql.includes('CREATE TABLE controlled_beta_expansion_candidate_segments'), 'Table controlled_beta_expansion_candidate_segments defined');
  assert(sql.includes('CREATE TABLE controlled_beta_expansion_candidate_participants'), 'Table controlled_beta_expansion_candidate_participants defined');
  assert(sql.includes('CREATE TABLE controlled_beta_expansion_draft_invite_batches'), 'Table controlled_beta_expansion_draft_invite_batches defined');
  assert(sql.includes('CREATE TABLE controlled_beta_expansion_draft_invite_recipients'), 'Table controlled_beta_expansion_draft_invite_recipients defined');
  assert(sql.includes('CREATE TABLE controlled_beta_expansion_guardrail_checks'), 'Table controlled_beta_expansion_guardrail_checks defined');
  assert(sql.includes('CREATE TABLE controlled_beta_expansion_preparation_findings'), 'Table controlled_beta_expansion_preparation_findings defined');
  assert(sql.includes('CREATE TABLE controlled_beta_expansion_preparation_approvals'), 'Table controlled_beta_expansion_preparation_approvals defined');
  assert(sql.includes('CREATE TABLE controlled_beta_expansion_preparation_evidence_packs'), 'Table controlled_beta_expansion_preparation_evidence_packs defined');
  assert(sql.includes('CREATE TABLE controlled_beta_expansion_preparation_audits'), 'Table controlled_beta_expansion_preparation_audits defined');

  assert(sql.includes('invite_sending_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'invite_sending_enabled defaults to 0');
  assert(sql.includes('active_invite_creation_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'active_invite_creation_enabled defaults to 0');
  assert(sql.includes('participant_auto_add_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'participant_auto_add_enabled defaults to 0');
  assert(sql.includes('scope_auto_broaden_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'scope_auto_broaden_enabled defaults to 0');
  assert(sql.includes('manual_approval_required TINYINT(1) NOT NULL DEFAULT 1'), 'manual_approval_required defaults to 1');
  assert(sql.includes('INDEX idx_cb_ex_prep_rev'), 'Indexes exist');
  assert(!sql.includes('ADD COLUMN IF NOT EXISTS'), 'No unsupported MySQL syntax');

  if (process.env.DATABASE_URL || process.env.MYSQL_HOST) {
    try {
      const tables = await db.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'controlled_beta_expansion_%'");
      const tNames = tables.map(t => t.TABLE_NAME);
      assert(tNames.includes('controlled_beta_expansion_preparation_gates'), 'Tables exist in INFORMATION_SCHEMA.TABLES');
      
      const cols = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'controlled_beta_expansion_preparation_gates'");
      const cNames = cols.map(c => c.COLUMN_NAME);
      assert(cNames.includes('invite_sending_enabled'), 'Expected columns exist in INFORMATION_SCHEMA.COLUMNS');
      
      const idx = await db.query("SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'controlled_beta_expansion_preparation_gates'");
      const idxNames = idx.map(i => i.INDEX_NAME);
      assert(idxNames.includes('idx_cb_ex_prep_rev'), 'Indexes exist in INFORMATION_SCHEMA.STATISTICS');

      const migrations = await db.query("SELECT * FROM schema_versions ORDER BY applied_at DESC LIMIT 50");
      const found = migrations.some(m => {
        const v = String(m.version || m.migration || m.migration_name || m.name || m.filename || m.description || '');
        return v.includes('080') || v.includes('phase132');
      });
      if (found) {
        assert(true, 'schema_versions contains migration 080');
      } else {
        assert(false, 'schema_versions contains migration 080');
        throw new Error('PHASE_132_MIGRATION_REGISTRY_MISSING');
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

  console.log(`\nSmoke 132A: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().then(() => {
  if (db && db.closePool) db.closePool();
}).catch(err => {
  console.error("FATAL ERROR in 132A:", err);
  process.exit(1);
});
