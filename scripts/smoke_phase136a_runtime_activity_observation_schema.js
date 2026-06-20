'use strict';

const db = require('../src/api/services/mysqlClient');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 136A: Runtime Activity Observation Schema ===\n');

(async () => {
  const isForceReal = process.env.FORCE_REAL_DB_SMOKE === 'true' || process.env.NODE_ENV === 'production';
  let hasDb = true;

  try {
    await db.query("SELECT 1");
  } catch (e) {
    hasDb = false;
    if (isForceReal) {
      console.error('FAIL: Real DB is required but connection failed: ' + e.message);
      process.exit(1);
    }
  }

  // 1. Migration file existence
  const migPath = path.join(__dirname, '..', 'migrations', '084_phase136_runtime_activity_observation_participant_usage_audit_gate.sql');
  assert(fs.existsSync(migPath), 'Migration 084 file exists');

  if (hasDb) {
    // 2. Registry version check
    const rows = await db.query("SELECT * FROM schema_versions WHERE version = '084'");
    assert(rows.length > 0, "schema_versions has version '084' registered");

    // 3. Table checks
    const tables = [
      'controlled_beta_runtime_activity_observation_gates',
      'controlled_beta_runtime_activity_events',
      'controlled_beta_runtime_activity_feature_usage',
      'controlled_beta_runtime_activity_daily_counters',
      'controlled_beta_runtime_activity_blocked_attempts',
      'controlled_beta_runtime_activity_anomaly_signals',
      'controlled_beta_runtime_activity_health_signals',
      'controlled_beta_runtime_activity_participant_summaries',
      'controlled_beta_runtime_activity_cohort_summaries',
      'controlled_beta_runtime_activity_guardrail_checks',
      'controlled_beta_runtime_activity_findings',
      'controlled_beta_runtime_activity_evidence_packs',
      'controlled_beta_runtime_activity_audits'
    ];

    for (const table of tables) {
      const cols = await db.query("SELECT COLUMN_NAME, COLUMN_DEFAULT, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()", [table]);
      assert(cols.length > 0, `Table ${table} exists and has columns`);

      if (table === 'controlled_beta_runtime_activity_observation_gates') {
        const obsEnabled = cols.find(c => c.COLUMN_NAME === 'observation_enabled');
        assert(obsEnabled && (obsEnabled.COLUMN_DEFAULT === '0' || obsEnabled.COLUMN_DEFAULT === 0), 'observation_enabled defaults to 0');
        const payment = cols.find(c => c.COLUMN_NAME === 'payment_execution_enabled');
        assert(payment && (payment.COLUMN_DEFAULT === '0' || payment.COLUMN_DEFAULT === 0), 'payment_execution_enabled defaults to 0');
      }
    }
  } else {
    console.log('Skipping database assertions (using mock mode/fallback).');
  }

  console.log(`\nSmoke 136A: Finished execution. ${passed} passed, ${failed} failed`);
  if (db && db.closePool) await db.closePool();
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error('FATAL error in 136A:', err);
  process.exit(1);
});
