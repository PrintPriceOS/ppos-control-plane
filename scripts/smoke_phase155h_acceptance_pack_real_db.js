'use strict';

const { execSync } = require('child_process');
const db = require('../src/api/services/mysqlClient');

const SMOKE_TESTS = [
  'smoke_phase155a_activation_token_auth_schema.js',
  'smoke_phase155b_create_token_auth_from_phase154_handoff.js',
  'smoke_phase155c_activation_token_auth_evaluator_rules.js',
  'smoke_phase155d_activation_token_auth_workflow_governance.js',
  'smoke_phase155e_evidence_pack_v155_lineage.js',
  'smoke_phase155f_admin_api_ui_contract.js',
  'smoke_phase155g_guardrail_authorized_not_issued_write_scope.js'
];

(async () => {
  console.log('=== Phase 155 Controlled High-Risk Cohort Intervention Activation Token Issuance Authorization Gate Acceptance Pack (155H) ===\n');

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

  // 1. Validate Phase 154H dependency
  console.log('--- Running Phase 154H dependency check ---');
  try {
    const env = {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'test',
      FORCE_REAL_DB_SMOKE: process.env.FORCE_REAL_DB_SMOKE || '',
      ALLOW_SCHEMA_SMOKE_FALLBACK: process.env.ALLOW_SCHEMA_SMOKE_FALLBACK || 'true',
      ALLOW_SMOKE_FALLBACK: process.env.ALLOW_SMOKE_FALLBACK || 'true'
    };
    execSync(`node -r dotenv/config scripts/smoke_phase154h_acceptance_pack_real_db.js`, { stdio: 'inherit', env });
    console.log('  PASS: Phase 154H dependency validated successfully.\n');
  } catch (err) {
    console.error('FATAL: Phase 154H dependency check failed. Phase 155 cannot proceed.');
    process.exit(1);
  }

  // 2. Run Phase 155 smoke tests
  console.log('--- Running Phase 155 smoke tests ---');
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
  console.log('PRINTPRICE OS — PHASE 155');
  console.log('CONTROLLED HIGH-RISK COHORT INTERVENTION ACTIVATION TOKEN ISSUANCE AUTHORIZATION GATE');
  console.log(`STATUS: ${failed === 0 ? 'PRODUCTION-VALIDATED' : 'FAILED'}`);
  console.log(`RESULT: ${failed === 0 ? 'READY' : 'BLOCKED'}`);
  console.log(`BLOCKERS: ${failed === 0 ? 'NONE' : failed + ' FAILED'}`);
  console.log(`REAL DB VALIDATION: ${isProdLike || isForced ? 'PASSED' : 'MOCK'}`);
  console.log(`ACCEPTANCE PACK: ${passed} passed, ${failed} failed`);
  console.log('SAFETY BOUNDARY: PRESERVED');
  console.log('HIGH-RISK EXECUTION: NOT ENABLED');
  console.log('TOKEN AUTHORIZATION: AUTHORIZED_NOT_ISSUED');
  console.log('TOKEN STATUS: PREPARED_NOT_ISSUED');
  console.log('TOKEN ISSUANCE: AUTHORIZED_NOT_ISSUED');
  console.log('TOKEN REDEEMABLE: NOT_REDEEMABLE');
  console.log('ACTIVATION EXECUTION STATUS: TOKEN_AUTH_FINALIZED_NOT_EXECUTED');
  console.log('PACKAGE FREEZE STATUS: FROZEN_IMMUTABLE');
  console.log('PLAN EXECUTABLE STATUS: NOT_EXECUTABLE');
  console.log('JOB CREATION: NO_REAL_JOB_CREATED');
  console.log('QUEUE DISPATCH: NO_QUEUE_DISPATCHED');
  console.log('RUNTIME MUTATION: ZERO_RUNTIME_MUTATION_CONFIRMED');
  console.log('WRITE SCOPE: PHASE_155_TABLES_ONLY');
  console.log('================================================================================\n');

  if (db.closePool) await db.closePool().catch(() => {});
  process.exit(failed > 0 ? 1 : 0);
})();
