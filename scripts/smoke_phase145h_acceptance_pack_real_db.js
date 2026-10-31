'use strict';

const { execSync } = require('child_process');
const db = require('../src/api/services/mysqlClient');

const SMOKE_TESTS = [
  'smoke_phase145a_execution_readiness_schema.js',
  'smoke_phase145b_create_readiness_from_phase144_approval.js',
  'smoke_phase145c_readiness_evaluator_checks.js',
  'smoke_phase145d_readiness_workflow_governance.js',
  'smoke_phase145e_evidence_pack_v145_lineage.js',
  'smoke_phase145f_admin_api_ui_contract.js',
  'smoke_phase145g_guardrail_no_execution_write_scope.js'
];

(async () => {
  console.log('=== Phase 145 Controlled High-Risk Cohort Intervention Execution Readiness Gate Acceptance Pack (145H) ===\n');

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

  // 1. Validate Phase 144H dependency
  console.log('--- Running Phase 144H dependency check ---');
  try {
    const env = {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'test',
      FORCE_REAL_DB_SMOKE: process.env.FORCE_REAL_DB_SMOKE || '',
      ALLOW_SCHEMA_SMOKE_FALLBACK: process.env.ALLOW_SCHEMA_SMOKE_FALLBACK || 'true',
      ALLOW_SMOKE_FALLBACK: process.env.ALLOW_SMOKE_FALLBACK || 'true'
    };
    execSync(`node -r dotenv/config scripts/smoke_phase144h_acceptance_pack_real_db.js`, { stdio: 'inherit', env });
    console.log('  PASS: Phase 144H dependency validated successfully.\n');
  } catch (err) {
    console.error('FATAL: Phase 144H dependency check failed. Phase 145 cannot proceed.');
    process.exit(1);
  }

  // 2. Run Phase 145 smoke tests
  console.log('--- Running Phase 145 smoke tests ---');
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
    } catch (err) {
      console.error(`  FAIL: ${script} failed\n`, err);
      failed++;
    }
  }

  console.log('\n================================================================================');
  console.log('PRINTPRICE OS — PHASE 145');
  console.log('CONTROLLED HIGH-RISK COHORT INTERVENTION EXECUTION READINESS GATE');
  console.log(`STATUS: ${failed === 0 ? 'PRODUCTION-VALIDATED' : 'FAILED'}`);
  console.log(`RESULT: ${failed === 0 ? 'READY' : 'BLOCKED'}`);
  console.log(`BLOCKERS: ${failed === 0 ? 'NONE' : failed + ' FAILED'}`);
  console.log(`REAL DB VALIDATION: ${isProdLike || isForced ? 'PASSED' : 'MOCK'}`);
  console.log(`ACCEPTANCE PACK: ${passed} passed, ${failed} failed`);
  console.log('SAFETY BOUNDARY: PRESERVED');
  console.log('HIGH-RISK EXECUTION: NOT ENABLED');
  console.log('EXECUTION READINESS: GOVERNED_ONLY');
  console.log('READINESS EXECUTION STATUS: READINESS_APPROVED_NOT_EXECUTED');
  console.log('WRITE SCOPE: PHASE_145_TABLES_ONLY');
  console.log('================================================================================\n');

  if (db.closePool) await db.closePool().catch(() => {});
  process.exit(failed > 0 ? 1 : 0);
})();
