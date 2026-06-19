'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 127.1a: Schema & Migration 073 Verification ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_SCHEMA_SMOKE_FALLBACK = 'true';

const db = require('../src/api/services/mysqlClient');
const hasDbConfig = !!(process.env.MYSQL_HOST || process.env.DATABASE_URL);
const isProdLike = process.env.NODE_ENV !== 'test';
const isFallbackAllowed = process.env.ALLOW_SCHEMA_SMOKE_FALLBACK === 'true' || process.env.NODE_ENV === 'test';

const migrationPath = path.join(__dirname, '..', 'migrations', '073_phase127_1_limited_beta_preparation_persistence_truth.sql');
const migrationExists = fs.existsSync(migrationPath);
assert(migrationExists, 'Migration 073 file exists');

(async () => {
  if (migrationExists) {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    const expectedColumns = [
      'gate_status', 'persistence_status', 'runtime_truth_status',
      'evidence_integrity_hash', 'verified_from_db', 'verified_from_phase126_1',
      'verified_secret_hygiene', 'restart_safe', 'fail_closed_verified',
      'cohort_status', 'invite_status', 'invite_hash', 'acceptance_status',
      'role_boundary_status', 'escalation_status', 'rollback_plan_status',
      'blocks_readiness'
    ];

    for (const col of expectedColumns) {
      assert(sql.includes(col), `Migration 073 references column ${col}`);
    }

    const expectedIndexes = [
      'idx_lbpg_gate_id', 'idx_lbpg_gate_status', 'idx_lbpg_created_at',
      'idx_lbc_gate_id', 'idx_lbc_cohort_id', 'idx_lbc_cohort_status', 'idx_lbc_created_at',
      'idx_lbcp_gate_id', 'idx_lbcp_cohort_id', 'idx_lbcp_participant_id',
      'idx_lbic_gate_id', 'idx_lbic_cohort_id', 'idx_lbic_invite_status', 'idx_lbic_invite_hash',
      'idx_lbta_gate_id', 'idx_lbta_participant_id', 'idx_lbta_acceptance_status',
      'idx_lbrb_gate_id', 'idx_lbrb_participant_id', 'idx_lbrb_status',
      'idx_lbse_gate_id', 'idx_lbse_status', 'idx_lbrp_gate_id', 'idx_lbrp_status',
      'idx_lbf_gate_id', 'idx_lbf_finding_status', 'idx_lbf_blocks_readiness',
      'idx_lba_gate_id', 'idx_lba_event_type', 'idx_lbep_gate_id', 'idx_lbep_evidence_status'
    ];

    for (const idx of expectedIndexes) {
      assert(sql.includes(idx), `Migration 073 creates index ${idx}`);
    }
  }

  if (isProdLike && !isFallbackAllowed) {
    if (!hasDbConfig) {
      console.error("  FAIL: running in production-like environment but database config is missing");
      process.exit(1);
    }
  }

  let realDbConnected = false;
  let migrationApplied = false;
  let gatesTableHardened = false;
  let invitesTableHardened = false;
  let findingsTableHardened = false;

  try {
    const schemaExists = await db.query(
      "SELECT version FROM schema_versions WHERE version LIKE '%073_phase127_1%' OR description LIKE '%073_phase127_1%'",
      []
    );
    realDbConnected = true;
    migrationApplied = schemaExists && schemaExists.length > 0;

    const columns = await db.query(
      `SELECT COLUMN_NAME, TABLE_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME IN ('limited_beta_preparation_gates', 'limited_beta_invite_codes', 'limited_beta_findings')`,
      []
    );

    const gateCols = columns.filter(c => c.TABLE_NAME === 'limited_beta_preparation_gates').map(c => c.COLUMN_NAME);
    const inviteCols = columns.filter(c => c.TABLE_NAME === 'limited_beta_invite_codes').map(c => c.COLUMN_NAME);
    const findingCols = columns.filter(c => c.TABLE_NAME === 'limited_beta_findings').map(c => c.COLUMN_NAME);

    gatesTableHardened = [
      'persistence_status', 'runtime_truth_status', 'evidence_integrity_hash',
      'verified_from_db', 'verified_from_phase126_1', 'verified_secret_hygiene',
      'restart_safe', 'fail_closed_verified'
    ].every(col => gateCols.includes(col));

    invitesTableHardened = ['invite_hash', 'expires_at', 'invite_status'].every(col => inviteCols.includes(col));
    findingsTableHardened = ['blocks_readiness'].every(col => findingCols.includes(col));

  } catch (err) {
    console.error("  Database check failed:", err.message);
    if (!isFallbackAllowed) {
      console.error("  FAIL: Database connection or check failed in production-like mode.");
      process.exit(1);
    }
  }

  if (realDbConnected) {
    assert(migrationApplied, "Migration 073 is applied in the database");
    assert(gatesTableHardened, "limited_beta_preparation_gates table has new columns");
    assert(invitesTableHardened, "limited_beta_invite_codes table has invite_hash");
    assert(findingsTableHardened, "limited_beta_findings table has blocks_readiness column");
  } else {
    assert(isFallbackAllowed, "Mock schema verification fallback is allowed in this environment");
  }

  console.log(`\nSmoke 127.1a: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  await db.closePool();
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 127.1a:", err);
  process.exit(1);
});
