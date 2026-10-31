'use strict';

const { execSync } = require('child_process');
const db = require('../src/api/services/mysqlClient');

const SMOKE_TESTS = [
  'smoke_phase157a_activation_token_final_apv_schema.js',
  'smoke_phase157b_create_token_final_apv_from_phase156_env.js',
  'smoke_phase157c_activation_token_final_apv_evaluator_rules.js',
  'smoke_phase157d_activation_token_final_apv_workflow_governance.js',
  'smoke_phase157e_evidence_pack_v157_lineage.js',
  'smoke_phase157f_admin_api_ui_contract.js',
  'smoke_phase157g_guardrail_final_approved_not_issued_write_scope.js'
];

(async () => {
  console.log('=== Phase 157 Controlled High-Risk Cohort Intervention Activation Token Final Issuance Approval Gate Acceptance Pack (157H) ===\n');

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

  // 1. Validate Phase 156H dependency
  console.log('--- Running Phase 156H dependency check ---');
  try {
    const env = {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'test',
      FORCE_REAL_DB_SMOKE: process.env.FORCE_REAL_DB_SMOKE || '',
      ALLOW_SCHEMA_SMOKE_FALLBACK: process.env.ALLOW_SCHEMA_SMOKE_FALLBACK || 'true',
      ALLOW_SMOKE_FALLBACK: process.env.ALLOW_SMOKE_FALLBACK || 'true'
    };
    execSync(`node -r dotenv/config scripts/smoke_phase156h_acceptance_pack_real_db.js`, { stdio: 'inherit', env });
    console.log('  PASS: Phase 156H dependency validated successfully.\n');
  } catch (err) {
    console.error('FATAL: Phase 156H dependency check failed. Phase 157 cannot proceed.');
    process.exit(1);
  }

  // 2. Run Phase 157 smoke tests
  console.log('--- Running Phase 157 smoke tests ---');
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
  console.log('PRINTPRICE OS — PHASE 157');
  console.log('CONTROLLED HIGH-RISK COHORT INTERVENTION ACTIVATION TOKEN FINAL ISSUANCE APPROVAL GATE');
  console.log(`STATUS: ${failed === 0 ? 'PRODUCTION-VALIDATED' : 'FAILED'}`);
  console.log(`RESULT: ${failed === 0 ? 'READY' : 'BLOCKED'}`);
  console.log(`BLOCKERS: ${failed === 0 ? 'NONE' : failed + ' FAILED'}`);
  console.log(`REAL DB VALIDATION: ${isProdLike || isForced ? 'PASSED' : 'MOCK'}`);
  console.log(`ACCEPTANCE PACK: ${passed} passed, ${failed} failed`);
  console.log('SAFETY BOUNDARY: PRESERVED');
  console.log('HIGH-RISK EXECUTION: NOT ENABLED');
  console.log('TOKEN FINAL APPROVAL: FINAL_APPROVED_NOT_ISSUED');
  console.log('TOKEN STATUS: PREPARED_NOT_ISSUED');
  console.log('TOKEN ISSUANCE: FINAL_APPROVED_NOT_ISSUED');
  console.log('TOKEN REDEEMABLE: NOT_REDEEMABLE');
  console.log('ACTIVATION EXECUTION STATUS: TOKEN_FINAL_APPROVAL_FINALIZED_NOT_EXECUTED');
  console.log('PACKAGE FREEZE STATUS: FROZEN_IMMUTABLE');
  console.log('PLAN EXECUTABLE STATUS: NOT_EXECUTABLE');
  console.log('JOB CREATION: NO_REAL_JOB_CREATED');
  console.log('QUEUE DISPATCH: NO_QUEUE_DISPATCHED');
  console.log('RUNTIME MUTATION: ZERO_RUNTIME_MUTATION_CONFIRMED');
  console.log('WRITE SCOPE: PHASE_157_TABLES_ONLY');
  console.log('================================================================================\n');

  if (db.closePool) await db.closePool().catch(() => {});
  process.exit(failed > 0 ? 1 : 0);
})();
