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

console.log('=== Smoke 128a: Phase 128 Schema & Migration 074 Verification ===\n');

const db = require('../src/api/services/mysqlClient');
const hasDbConfig = !!(process.env.MYSQL_HOST || process.env.DATABASE_URL);
const isProductionLike = isProductionLikeEnvironment();
const isFallbackAllowed = process.env.ALLOW_SCHEMA_SMOKE_FALLBACK === 'true' || process.env.NODE_ENV === 'test';

if (process.env.DATABASE_URL) {
  console.log(`Connecting to database: ${redactConnectionString(process.env.DATABASE_URL)}`);
}

const migrationPath = path.join(__dirname, '..', 'migrations', '074_phase128_invite_only_limited_beta_runtime.sql');
const migrationExists = fs.existsSync(migrationPath);
assert(migrationExists, 'Migration 074 file exists');

(async () => {
  if (migrationExists) {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    const expectedTables = [
      'limited_beta_runtime_sessions',
      'limited_beta_runtime_access_grants',
      'limited_beta_runtime_access_denials',
      'limited_beta_runtime_scope_policies',
      'limited_beta_runtime_kill_switches',
      'limited_beta_runtime_feature_flags',
      'limited_beta_runtime_activity_logs',
      'limited_beta_runtime_guardrail_events',
      'limited_beta_runtime_rollback_events',
      'limited_beta_runtime_findings',
      'limited_beta_runtime_evidence_packs'
    ];

    for (const t of expectedTables) {
      assert(sql.includes(`CREATE TABLE IF NOT EXISTS ${t}`), `Migration 074 defines table ${t}`);
    }

    const expectedColumns = [
      'beta_runtime_enabled', 'invite_only', 'cohort_scoped', 'tenant_scoped',
      'participant_scoped', 'kill_switch_enabled', 'full_public_enabled',
      'open_marketplace_enabled', 'payment_execution_enabled', 'refund_execution_enabled',
      'payout_execution_enabled', 'live_provider_connectivity_enabled',
      'provider_external_submission_enabled', 'external_tax_submission_enabled',
      'external_accounting_submission_enabled', 'source_mutation_enabled',
      'runtime_truth_status', 'persistence_status', 'evidence_integrity_hash',
      'verified_from_phase127_1', 'verified_from_db', 'fail_closed_verified', 'rollback_ready'
    ];

    for (const col of expectedColumns) {
      assert(sql.includes(col), `Migration 074 references column ${col}`);
    }

    const safetyDefaults = [
      'beta_runtime_enabled TINYINT(1) NOT NULL DEFAULT 0',
      'invite_only TINYINT(1) NOT NULL DEFAULT 1',
      'cohort_scoped TINYINT(1) NOT NULL DEFAULT 1',
      'tenant_scoped TINYINT(1) NOT NULL DEFAULT 1',
      'participant_scoped TINYINT(1) NOT NULL DEFAULT 1',
      'kill_switch_enabled TINYINT(1) NOT NULL DEFAULT 1',
      'full_public_enabled TINYINT(1) NOT NULL DEFAULT 0',
      'open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0',
      'payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0',
      'refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0',
      'payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0',
      'live_provider_connectivity_enabled TINYINT(1) NOT NULL DEFAULT 0',
      'provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0',
      'external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0',
      'external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0',
      'source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0',
      'verified_from_phase127_1 TINYINT(1) NOT NULL DEFAULT 0',
      'verified_from_db TINYINT(1) NOT NULL DEFAULT 0',
      'fail_closed_verified TINYINT(1) NOT NULL DEFAULT 0',
      'rollback_ready TINYINT(1) NOT NULL DEFAULT 0'
    ];

    for (const d of safetyDefaults) {
      assert(sql.includes(d), `Column default verified: ${d}`);
    }
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
      "SELECT version FROM schema_versions WHERE version LIKE '%074_phase128%' OR description LIKE '%074_phase128%'",
      []
    );
    realDbConnected = true;
    migrationApplied = schemaExists && schemaExists.length > 0;

    const runtimeTables = [
      'limited_beta_runtime_sessions',
      'limited_beta_runtime_access_grants',
      'limited_beta_runtime_access_denials',
      'limited_beta_runtime_scope_policies',
      'limited_beta_runtime_kill_switches',
      'limited_beta_runtime_feature_flags',
      'limited_beta_runtime_activity_logs',
      'limited_beta_runtime_guardrail_events',
      'limited_beta_runtime_rollback_events',
      'limited_beta_runtime_findings',
      'limited_beta_runtime_evidence_packs'
    ];

    // Check TABLES
    const tablesInDb = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'limited_beta_runtime_%'`,
      []
    );
    const tableNames = tablesInDb.map(t => t.TABLE_NAME);
    tablesVerified = runtimeTables.every(t => tableNames.includes(t));

    // Check COLUMNS on limited_beta_runtime_sessions
    const colsInDb = await db.query(
      `SELECT COLUMN_NAME, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'limited_beta_runtime_sessions'`,
      []
    );
    const colNames = colsInDb.map(c => c.COLUMN_NAME);
    const expectedCols = [
      'session_id', 'gate_id', 'cohort_id', 'participant_id', 'tenant_id', 'scope_policy_id', 'access_status',
      'beta_runtime_enabled', 'invite_only', 'cohort_scoped', 'tenant_scoped', 'participant_scoped', 'kill_switch_enabled',
      'full_public_enabled', 'open_marketplace_enabled', 'payment_execution_enabled', 'refund_execution_enabled',
      'payout_execution_enabled', 'live_provider_connectivity_enabled', 'provider_external_submission_enabled',
      'external_tax_submission_enabled', 'external_accounting_submission_enabled', 'source_mutation_enabled'
    ];
    columnsVerified = expectedCols.every(c => colNames.includes(c));

    // Verify safety defaults from COLUMN_DEFAULT in real DB (sessions table / evidence packs table)
    const defaultsToCheck = {
      beta_runtime_enabled: '0',
      invite_only: '1',
      cohort_scoped: '1',
      tenant_scoped: '1',
      participant_scoped: '1',
      kill_switch_enabled: '1',
      full_public_enabled: '0',
      open_marketplace_enabled: '0',
      payment_execution_enabled: '0',
      refund_execution_enabled: '0',
      payout_execution_enabled: '0',
      live_provider_connectivity_enabled: '0',
      provider_external_submission_enabled: '0',
      external_tax_submission_enabled: '0',
      external_accounting_submission_enabled: '0',
      source_mutation_enabled: '0'
    };

    let defaultsMatch = true;
    for (const [col, defVal] of Object.entries(defaultsToCheck)) {
      const colObj = colsInDb.find(c => c.COLUMN_NAME === col);
      if (!colObj) {
        defaultsMatch = false;
        break;
      }
      // Depending on mysql driver version, default could be '0', 0, '1', 1, or dynamic string
      const actualDefault = String(colObj.COLUMN_DEFAULT);
      if (actualDefault !== defVal) {
        defaultsMatch = false;
      }
    }
    safetyDefaultsVerified = defaultsMatch;

    // Check INDEXES from STATISTICS
    const indexesInDb = await db.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'limited_beta_runtime_sessions'`,
      []
    );
    const indexNames = indexesInDb.map(i => i.INDEX_NAME);
    const expectedIndexes = [
      'idx_lbrs_session_id', 'idx_lbrs_gate_id', 'idx_lbrs_cohort_id', 'idx_lbrs_participant_id', 'idx_lbrs_tenant_id', 'idx_lbrs_access_status', 'idx_lbrs_created_at'
    ];
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
    assert(migrationApplied, "Migration 074 is applied in the database");
    assert(tablesVerified, "All limited_beta_runtime_% tables verified in INFORMATION_SCHEMA.TABLES");
    assert(columnsVerified, "All expected columns verified in INFORMATION_SCHEMA.COLUMNS");
    assert(safetyDefaultsVerified, "All safety defaults verified in real DB");
    assert(indexesVerified, "Required runtime indexes verified in STATISTICS");
  } else {
    if (isProductionLike && !isFallbackAllowed) {
      console.error("  FAIL: Real DB schema verification required in production-like mode");
      process.exit(1);
    }
    assert(isFallbackAllowed, "Mock schema verification fallback is allowed in this environment");
  }

  console.log(`\nSmoke 128a: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  await db.closePool();
  process.exit(0);
})().catch(err => {
  const redactedErr = redactConnectionString(err.message);
  console.error("FATAL ERROR in 128a:", redactedErr);
  process.exit(1);
});
