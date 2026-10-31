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

console.log('=== Smoke 129a: Phase 129 Schema & Migration 076 Verification ===\n');

const db = require('../src/api/services/mysqlClient');
const hasDbConfig = !!(process.env.MYSQL_HOST || process.env.DATABASE_URL);
const isProductionLike = isProductionLikeEnvironment();
const isFallbackAllowed = process.env.ALLOW_SCHEMA_SMOKE_FALLBACK === 'true' || process.env.NODE_ENV === 'test';

if (process.env.DATABASE_URL) {
  console.log(`Connecting to database: ${redactConnectionString(process.env.DATABASE_URL)}`);
}

const migrationPath = path.join(__dirname, '..', 'migrations', '076_phase129_first_controlled_invite_only_beta_cohort_activation.sql');
const migrationExists = fs.existsSync(migrationPath);
assert(migrationExists, 'Migration 076 file exists');

(async () => {
  if (migrationExists) {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    const expectedTables = [
      'controlled_beta_cohort_activations',
      'controlled_beta_activation_participants',
      'controlled_beta_activation_invites',
      'controlled_beta_activation_scope_bindings',
      'controlled_beta_activation_session_limits',
      'controlled_beta_activation_monitoring_events',
      'controlled_beta_activation_support_events',
      'controlled_beta_activation_incident_events',
      'controlled_beta_activation_kill_switch_events',
      'controlled_beta_activation_findings',
      'controlled_beta_activation_evidence_packs'
    ];

    for (const t of expectedTables) {
      assert(sql.includes(`CREATE TABLE IF NOT EXISTS ${t}`), `Migration 076 defines table ${t}`);
    }
  }

  let realDbConnected = false;
  let migrationApplied = false;
  let tablesVerified = false;

  try {
    if (!hasDbConfig) {
      throw new Error('MySQL is UNCONFIGURED. Ensure MYSQL_HOST or DATABASE_URL is set in .env');
    }

    const schemaExists = await db.query(
      "SELECT version FROM schema_versions WHERE version LIKE '%076_phase129%' OR description LIKE '%076_phase129%'",
      []
    );
    realDbConnected = true;
    migrationApplied = schemaExists && schemaExists.length > 0;

    const runtimeTables = [
      'controlled_beta_cohort_activations',
      'controlled_beta_activation_participants',
      'controlled_beta_activation_invites',
      'controlled_beta_activation_scope_bindings',
      'controlled_beta_activation_session_limits',
      'controlled_beta_activation_monitoring_events',
      'controlled_beta_activation_support_events',
      'controlled_beta_activation_incident_events',
      'controlled_beta_activation_kill_switch_events',
      'controlled_beta_activation_findings',
      'controlled_beta_activation_evidence_packs'
    ];

    // Check TABLES
    const tablesInDb = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'controlled_beta_%'`,
      []
    );
    const tableNames = tablesInDb.map(t => t.TABLE_NAME);
    tablesVerified = runtimeTables.every(t => tableNames.includes(t));

  } catch (err) {
    const redactedErr = redactConnectionString(err.message);
    console.error("  Database check failed:", redactedErr);
    if (isProductionLike && !isFallbackAllowed) {
      console.error("  FAIL: Real DB schema verification required in production-like mode");
      process.exit(1);
    }
  }

  if (realDbConnected) {
    assert(migrationApplied, "Migration 076 is applied in the database");
    assert(tablesVerified, "All controlled_beta_% tables verified in INFORMATION_SCHEMA.TABLES");
  } else {
    if (isProductionLike && !isFallbackAllowed) {
      console.error("  FAIL: Real DB schema verification required in production-like mode");
      process.exit(1);
    }
    assert(isFallbackAllowed, "Mock schema verification fallback is allowed in this environment");
  }

  console.log(`\nSmoke 129a: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  if (db && db.closePool) await db.closePool();
  process.exit(0);
})().catch(err => {
  const redactedErr = redactConnectionString(err.message);
  console.error("FATAL ERROR in 129a:", redactedErr);
  process.exit(1);
});
