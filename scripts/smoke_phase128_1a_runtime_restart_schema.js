'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

function isProductionLikeEnvironment() {
  const isProd = process.env.NODE_ENV === 'production';
  const hasDbUrl = !!process.env.DATABASE_URL;
  const inOptPath = process.cwd().includes('/opt/printprice-os') || process.cwd().includes('\\opt\\printprice-os');
  const isCiProd = process.env.CI_PRODUCTION_SMOKE === 'true';
  return isProd || hasDbUrl || inOptPath || isCiProd;
}

function redactConnectionString(str) {
  if (!str) return str;
  return str.replace(/mysql:\/\/([^:]+):([^@]+)@/g, 'mysql://$1:[REDACTED]@');
}

console.log('=== Smoke 128.1a: Schema & Migration 075 Verification ===\n');

const db = require('../src/api/services/mysqlClient');
const hasDbConfig = !!(process.env.MYSQL_HOST || process.env.DATABASE_URL);
const isProductionLike = isProductionLikeEnvironment();
const isFallbackAllowed = process.env.ALLOW_SCHEMA_SMOKE_FALLBACK === 'true' || process.env.NODE_ENV === 'test';

if (process.env.DATABASE_URL) {
  console.log(`Connecting to database: ${redactConnectionString(process.env.DATABASE_URL)}`);
}

const migrationPath = path.join(__dirname, '..', 'migrations', '075_phase128_1_runtime_persistence_restart_recovery_drill.sql');
const migrationExists = fs.existsSync(migrationPath);
assert(migrationExists, 'Migration 075 file exists');

(async () => {
  if (migrationExists) {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    const expectedCols = [
      'restart_recovery_status',
      'last_verified_after_restart_at',
      'recovered_from_db',
      'memory_state_detected',
      'restart_safe',
      'kill_switch_survived_restart',
      'access_policy_survived_restart',
      'session_state_survived_restart',
      'evidence_pack_survived_restart',
      'recovery_integrity_hash'
    ];

    for (const c of expectedCols) {
      assert(sql.includes(c), `Migration 075 adds column: ${c}`);
    }

    assert(sql.includes('CREATE TABLE IF NOT EXISTS limited_beta_runtime_restart_drills'), 'Migration 075 creates drills table');
  }

  let realDbConnected = false;
  let migrationApplied = false;
  let tablesVerified = false;
  let columnsVerified = false;
  let indexesVerified = false;
  let safetyDefaultsVerified = false;

  try {
    if (!hasDbConfig) {
      throw new Error('MySQL is UNCONFIGURED. Ensure MYSQL_HOST or DATABASE_URL is set in .env');
    }

    const schemaExists = await db.query(
      "SELECT version FROM schema_versions WHERE version LIKE '%075_phase128_1%' OR description LIKE '%075_phase128_1%'",
      []
    );
    realDbConnected = true;
    migrationApplied = schemaExists && schemaExists.length > 0;

    // Verify limited_beta_runtime_restart_drills table exists
    const tablesInDb = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'limited_beta_runtime_restart_drills'`,
      []
    );
    tablesVerified = tablesInDb && tablesInDb.length > 0;

    // Verify columns on limited_beta_runtime_sessions
    const colsInDb = await db.query(
      `SELECT COLUMN_NAME, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'limited_beta_runtime_sessions'`,
      []
    );
    const colNames = colsInDb.map(c => c.COLUMN_NAME);
    const expectedRestartCols = [
      'restart_recovery_status',
      'last_verified_after_restart_at',
      'recovered_from_db',
      'memory_state_detected',
      'restart_safe',
      'kill_switch_survived_restart',
      'access_policy_survived_restart',
      'session_state_survived_restart',
      'evidence_pack_survived_restart',
      'recovery_integrity_hash'
    ];
    columnsVerified = expectedRestartCols.every(c => colNames.includes(c));

    // Verify safety defaults (new columns default to 0)
    const defaultsToCheck = {
      recovered_from_db: '0',
      memory_state_detected: '0',
      restart_safe: '0',
      kill_switch_survived_restart: '0',
      access_policy_survived_restart: '0',
      session_state_survived_restart: '0',
      evidence_pack_survived_restart: '0'
    };

    let defaultsMatch = true;
    for (const [col, defVal] of Object.entries(defaultsToCheck)) {
      const colObj = colsInDb.find(c => c.COLUMN_NAME === col);
      if (!colObj) {
        defaultsMatch = false;
        break;
      }
      const actualDefault = String(colObj.COLUMN_DEFAULT);
      if (actualDefault !== defVal) {
        defaultsMatch = false;
      }
    }
    safetyDefaultsVerified = defaultsMatch;

    // Verify Indexes
    const indexesInDb = await db.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND (TABLE_NAME = 'limited_beta_runtime_sessions' OR TABLE_NAME = 'limited_beta_runtime_evidence_packs' OR TABLE_NAME = 'limited_beta_runtime_restart_drills')`,
      []
    );
    const indexNames = indexesInDb.map(i => i.INDEX_NAME);
    const expectedIndexes = ['idx_lbrs_rec', 'idx_lbrep_rec', 'idx_lbrrd_gate_id'];
    indexesVerified = expectedIndexes.every(idx => indexNames.includes(idx));

  } catch (err) {
    const redactedErr = redactConnectionString(err.message);
    console.error("  Database check failed:", redactedErr);
    if (isProductionLike && !isFallbackAllowed) {
      console.error("  FAIL: Real DB schema verification required in production-like mode");
      process.exit(1);
    }
  }

  if (realDbConnected) {
    assert(migrationApplied, "Migration 075 is applied in the database");
    assert(tablesVerified, "Drills table verified in INFORMATION_SCHEMA.TABLES");
    assert(columnsVerified, "All expected restart columns verified in INFORMATION_SCHEMA.COLUMNS");
    assert(safetyDefaultsVerified, "All restart safety defaults verified in real DB");
    assert(indexesVerified, "Required indexes verified in STATISTICS");
  } else {
    if (isProductionLike && !isFallbackAllowed) {
      console.error("  FAIL: Real DB schema verification required in production-like mode");
      process.exit(1);
    }
    assert(isFallbackAllowed, "Mock schema verification fallback is allowed in this environment");
  }

  console.log(`\nSmoke 128.1a: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  if (db && db.closePool) await db.closePool();
  process.exit(0);
})().catch(err => {
  const redactedErr = redactConnectionString(err.message);
  console.error("FATAL ERROR in 128.1a:", redactedErr);
  process.exit(1);
});
