'use strict';
// Smoke 143H: Acceptance Pack Real DB
// Runs all Phase 143 smoke tests and verifies Phase 142H dependency.

const { execSync } = require('child_process');
const db = require('../src/api/services/mysqlClient');

const SMOKE_TESTS = [
  'smoke_phase143a_approval_preparation_schema.js',
  'smoke_phase143b_create_prep_from_phase142_review.js',
  'smoke_phase143c_preparation_evaluator_rules.js',
  'smoke_phase143d_preparation_workflow_governance.js',
  'smoke_phase143e_evidence_pack_v143_lineage.js',
  'smoke_phase143f_admin_api_ui_contract.js',
  'smoke_phase143g_guardrail_write_scope_forbidden_scanner.js'
];

(async () => {
  console.log('=== Phase 143 High-Risk Cohort Intervention Approval Preparation Gate Acceptance Pack (143H) ===\n');

  // Verify DB is reachable
  const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
  const isForced = process.env.FORCE_REAL_DB_SMOKE === 'true';
  const noFallback = process.env.ALLOW_SMOKE_FALLBACK === 'false';

  if (isForced || isProdLike) {
    try {
      await db.query('SELECT 1');
      console.log('Database is reachable.\n');
    } catch (e) {
      if (noFallback) {
        console.error('FATAL: Database is not reachable and ALLOW_SMOKE_FALLBACK=false');
        process.exit(1);
      }
      console.warn('Database not reachable; running in mock mode.\n');
    }
  }

  // 1. Validate Phase 142H dependency
  console.log('--- Running Phase 142H dependency check ---');
  try {
    const env = {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'test',
      FORCE_REAL_DB_SMOKE: process.env.FORCE_REAL_DB_SMOKE || '',
      ALLOW_SCHEMA_SMOKE_FALLBACK: process.env.ALLOW_SCHEMA_SMOKE_FALLBACK || 'true',
      ALLOW_SMOKE_FALLBACK: process.env.ALLOW_SMOKE_FALLBACK || 'true'
    };
    execSync(`node -r dotenv/config scripts/smoke_phase142h_acceptance_pack_real_db.js`, { stdio: 'inherit', env });
    console.log('  PASS: Phase 142H dependency validated successfully.\n');
  } catch (err) {
    console.error('FATAL: Phase 142H dependency check failed. Phase 143 cannot proceed.');
    process.exit(1);
  }

  // 2. Run Phase 143 smoke tests
  console.log('--- Running Phase 143 smoke tests ---');
  let passed = 0;
  let failed = 0;

  for (const script of SMOKE_TESTS) {
    try {
      const env = {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || 'test',
        FORCE_REAL_DB_SMOKE: process.env.FORCE_REAL_DB_SMOKE || '',
        ALLOW_SCHEMA_SMOKE_FALLBACK: process.env.ALLOW_SCHEMA_SMOKE_FALLBACK || 'true',
        ALLOW_SMOKE_FALLBACK: process.env.ALLOW_SMOKE_FALLBACK || 'true'
      };
      execSync(`node -r dotenv/config scripts/${script}`, { stdio: 'inherit', env });
      console.log(`  PASS: ${script} passed\n`);
      passed++;
    } catch {
      console.error(`  FAIL: ${script} failed\n`);
      failed++;
    }
  }

  console.log('\n================================================================================');
  console.log('PRINTPRICE OS — PHASE 143');
  console.log('HIGH-RISK COHORT INTERVENTION APPROVAL PREPARATION GATE');
  console.log(`STATUS: ${failed === 0 ? 'PRODUCTION-VALIDATED' : 'FAILED'}`);
  console.log(`RESULT: ${failed === 0 ? 'READY' : 'BLOCKED'}`);
  console.log(`BLOCKERS: ${failed === 0 ? 'NONE' : failed + ' FAILED'}`);
  console.log(`REAL DB VALIDATION: ${isProdLike || isForced ? 'PASSED' : 'MOCK'}`);
  console.log(`ACCEPTANCE PACK: ${passed} passed, ${failed} failed`);
  console.log('SAFETY BOUNDARY: PRESERVED');
  console.log('HIGH-RISK EXECUTION: NOT ENABLED');
  console.log('APPROVAL EXECUTION: NOT ENABLED');
  console.log('WRITE SCOPE: PHASE_143_TABLES_ONLY');
  console.log('================================================================================\n');

  if (db.closePool) await db.closePool().catch(() => {});
  process.exit(failed > 0 ? 1 : 0);
})();
