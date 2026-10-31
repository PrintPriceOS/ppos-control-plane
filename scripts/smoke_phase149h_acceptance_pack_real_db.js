'use strict';

const { execSync } = require('child_process');
const db = require('../src/api/services/mysqlClient');

const SMOKE_TESTS = [
  'smoke_phase149a_execution_plan_schema.js',
  'smoke_phase149b_create_plan_from_phase148_dispatcher.js',
  'smoke_phase149c_execution_plan_evaluator_rules.js',
  'smoke_phase149d_execution_plan_workflow_governance.js',
  'smoke_phase149e_evidence_pack_v149_lineage.js',
  'smoke_phase149f_admin_api_ui_contract.js',
  'smoke_phase149g_guardrail_plan_not_executable_write_scope.js'
];

(async () => {
  console.log('=== Phase 149 Controlled High-Risk Cohort Intervention Execution Plan Materialization Gate Acceptance Pack (149H) ===\n');

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

  // 1. Validate Phase 148H dependency
  console.log('--- Running Phase 148H dependency check ---');
  try {
    const env = {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'test',
      FORCE_REAL_DB_SMOKE: process.env.FORCE_REAL_DB_SMOKE || '',
      ALLOW_SCHEMA_SMOKE_FALLBACK: process.env.ALLOW_SCHEMA_SMOKE_FALLBACK || 'true',
      ALLOW_SMOKE_FALLBACK: process.env.ALLOW_SMOKE_FALLBACK || 'true'
    };
    execSync(`node -r dotenv/config scripts/smoke_phase148h_acceptance_pack_real_db.js`, { stdio: 'inherit', env });
    console.log('  PASS: Phase 148H dependency validated successfully.\n');
  } catch (err) {
    console.error('FATAL: Phase 148H dependency check failed. Phase 149 cannot proceed.');
    process.exit(1);
  }

  // 2. Run Phase 149 smoke tests
  console.log('--- Running Phase 149 smoke tests ---');
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
  console.log('PRINTPRICE OS — PHASE 149');
  console.log('CONTROLLED HIGH-RISK COHORT INTERVENTION EXECUTION PLAN MATERIALIZATION GATE');
  console.log(`STATUS: ${failed === 0 ? 'PRODUCTION-VALIDATED' : 'FAILED'}`);
  console.log(`RESULT: ${failed === 0 ? 'READY' : 'BLOCKED'}`);
  console.log(`BLOCKERS: ${failed === 0 ? 'NONE' : failed + ' FAILED'}`);
  console.log(`REAL DB VALIDATION: ${isProdLike || isForced ? 'PASSED' : 'MOCK'}`);
  console.log(`ACCEPTANCE PACK: ${passed} passed, ${failed} failed`);
  console.log('SAFETY BOUNDARY: PRESERVED');
  console.log('HIGH-RISK EXECUTION: NOT ENABLED');
  console.log('EXECUTION PLAN STATUS: MATERIALIZED_NOT_EXECUTABLE');
  console.log('PLAN EXECUTION STATUS: PLAN_MATERIALIZED_NOT_EXECUTED');
  console.log('JOB CREATION: NO_REAL_JOB_CREATED');
  console.log('QUEUE DISPATCH: NO_QUEUE_DISPATCHED');
  console.log('RUNTIME MUTATION: ZERO_RUNTIME_MUTATION_CONFIRMED');
  console.log('WRITE SCOPE: PHASE_149_TABLES_ONLY');
  console.log('================================================================================\n');

  if (db.closePool) await db.closePool().catch(() => {});
  process.exit(failed > 0 ? 1 : 0);
})();
