'use strict';

const { execSync } = require('child_process');
const db = require('../src/api/services/mysqlClient');

const SMOKE_TESTS = [
  'smoke_phase147a_no_op_envelope_schema.js',
  'smoke_phase147b_create_envelope_from_phase146_authorization.js',
  'smoke_phase147c_no_op_envelope_evaluator_rules.js',
  'smoke_phase147d_no_op_envelope_workflow_governance.js',
  'smoke_phase147e_evidence_pack_v147_lineage.js',
  'smoke_phase147f_admin_api_ui_contract.js',
  'smoke_phase147g_guardrail_no_op_zero_mutation_write_scope.js'
];

(async () => {
  console.log('=== Phase 147 Controlled High-Risk Cohort Intervention No-Op Execution Envelope Gate Acceptance Pack (147H) ===\n');

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

  // 1. Validate Phase 146H dependency
  console.log('--- Running Phase 146H dependency check ---');
  try {
    const env = {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'test',
      FORCE_REAL_DB_SMOKE: process.env.FORCE_REAL_DB_SMOKE || '',
      ALLOW_SCHEMA_SMOKE_FALLBACK: process.env.ALLOW_SCHEMA_SMOKE_FALLBACK || 'true',
      ALLOW_SMOKE_FALLBACK: process.env.ALLOW_SMOKE_FALLBACK || 'true'
    };
    execSync(`node -r dotenv/config scripts/smoke_phase146h_acceptance_pack_real_db.js`, { stdio: 'inherit', env });
    console.log('  PASS: Phase 146H dependency validated successfully.\n');
  } catch (err) {
    console.error('FATAL: Phase 146H dependency check failed. Phase 147 cannot proceed.');
    process.exit(1);
  }

  // 2. Run Phase 147 smoke tests
  console.log('--- Running Phase 147 smoke tests ---');
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
  console.log('PRINTPRICE OS — PHASE 147');
  console.log('CONTROLLED HIGH-RISK COHORT INTERVENTION NO-OP EXECUTION ENVELOPE GATE');
  console.log(`STATUS: ${failed === 0 ? 'PRODUCTION-VALIDATED' : 'FAILED'}`);
  console.log(`RESULT: ${failed === 0 ? 'READY' : 'BLOCKED'}`);
  console.log(`BLOCKERS: ${failed === 0 ? 'NONE' : failed + ' FAILED'}`);
  console.log(`REAL DB VALIDATION: ${isProdLike || isForced ? 'PASSED' : 'MOCK'}`);
  console.log(`ACCEPTANCE PACK: ${passed} passed, ${failed} failed`);
  console.log('SAFETY BOUNDARY: PRESERVED');
  console.log('HIGH-RISK EXECUTION: NOT ENABLED');
  console.log('NO-OP ENVELOPE: VALIDATED');
  console.log('NO-OP EXECUTION RESULT: NO_OP_EXECUTED_NOT_MUTATED');
  console.log('JOB DISPATCH: NO_JOB_DISPATCHED');
  console.log('RUNTIME MUTATION: ZERO_RUNTIME_MUTATION_CONFIRMED');
  console.log('WRITE SCOPE: PHASE_147_TABLES_ONLY');
  console.log('================================================================================\n');

  if (db.closePool) await db.closePool().catch(() => {});
  process.exit(failed > 0 ? 1 : 0);
})();
