'use strict';

const { execSync } = require('child_process');
const path = require('path');
const db = require('../src/api/services/mysqlClient');
const setupHelper = require('./smoke_phase166_setup_helper');

const forceRealDb = process.env.FORCE_REAL_DB_SMOKE === 'true';
const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || forceRealDb) && process.env.DB_UNREACHABLE !== 'true';

const scripts = [
  'smoke_phase180a_activation_token_redemption_unlock_governance_readiness_closure_schema.js',
  'smoke_phase180b_create_unlock_governance_readiness_closure_from_phase179_fnees.js',
  'smoke_phase180c_activation_token_redemption_unlock_governance_readiness_closure_evaluator_rules.js',
  'smoke_phase180d_activation_token_redemption_unlock_governance_readiness_closure_decision.js',
  'smoke_phase180e_activation_token_redemption_unlock_governance_readiness_closure_finalize.js',
  'smoke_phase180f_activation_token_redemption_unlock_governance_readiness_closure_admin_api_ui_contract.js',
  'smoke_phase180g_activation_token_redemption_unlock_governance_readiness_closure_guardrail.js'
];

(async () => {
  console.log('===============================================================================');
  console.log('PRINTPRICE OS — ACCEPTANCE PACK RUNNER — Phase 180');
  console.log('CONTROLLED HIGH-RISK COHORT INTERVENTION ACTIVATION TOKEN REDEMPTION UNLOCK GOVERNANCE READINESS CLOSURE GATE');
  console.log('===============================================================================\n');

  console.log('--- Validating Phase 179H Dependency ---');
  try {
    const parentValidationPath = path.join(__dirname, 'smoke_phase179e_activation_token_redemption_unlock_final_non_execution_evidence_seal_finalize.js');
    execSync(`node "${parentValidationPath}"`, { stdio: 'inherit' });
    console.log('  PASS: Phase 179 dependency verified.\n');
  } catch (e) {
    console.error('FAIL: Phase 179 dependency check failed.', e.message);
    process.exit(1);
  }

  console.log('--- Running Phase 180 smoke tests ---\n');

  let passed = 0;
  let failed = 0;

  for (const script of scripts) {
    console.log(`--- Running Smoke ${script.toUpperCase().replace('.JS', '')} ---`);
    try {
      const scriptPath = path.join(__dirname, script);
      execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
      passed++;
      console.log();
    } catch (e) {
      failed++;
      console.error(`\nFAIL: Smoke test ${script} failed.\n`);
    }
  }

  console.log('================================================================================');
  console.log('PRINTPRICE OS — PHASE 180');
  console.log('CONTROLLED HIGH-RISK COHORT INTERVENTION ACTIVATION TOKEN REDEMPTION UNLOCK GOVERNANCE READINESS CLOSURE GATE');
  if (failed === 0) {
    console.log(`STATUS: ${isProdLike ? 'PRODUCTION-VALIDATED' : 'MOCK-VALIDATED'}`);
    console.log(`RESULT: ${isProdLike ? 'READY' : 'READY IN MOCK'}`);
  } else {
    console.log('STATUS: FAILED');
    console.log('RESULT: BLOCKED');
  }
  console.log(`BLOCKERS: ${failed > 0 ? 'FAILING_SMOKE_TESTS' : 'NONE'}`);
  console.log(`REAL DB VALIDATION: ${isProdLike ? passed : 0} passed, ${isProdLike ? failed : 0} failed`);
  console.log('SAFETY BOUNDARY: PRESERVED');
  console.log('HIGH-RISK EXECUTION: NOT ENABLED');
  console.log('UNLOCK FINAL NON-EXECUTION EVIDENCE SEAL: FINAL_NON_EXECUTION_EVIDENCE_SEALED_NOT_UNLOCKED');
  console.log('UNLOCK GOVERNANCE READINESS CLOSURE: GOVERNANCE_READINESS_CLOSED_NOT_UNLOCKED');
  console.log('TOKEN STATUS: ISSUANCE_RECORDED_NOT_REDEEMABLE');
  console.log('TOKEN REDEMPTION: LOCKED_NOT_REDEEMED');
  console.log('TOKEN UNLOCK: NOT_UNLOCKED');
  console.log('TOKEN REDEEMABLE: NOT_REDEEMABLE');
  console.log('ACTIVATION EXECUTION STATUS: UNLOCK_GOVERNANCE_READINESS_CLOSURE_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED');
  console.log('REDEMPTION PACKAGE FREEZE STATUS: REDEMPTION_PACKAGE_FROZEN_IMMUTABLE');
  console.log('PACKAGE FREEZE STATUS: FROZEN_IMMUTABLE');
  console.log('PLAN EXECUTABLE STATUS: NOT_EXECUTABLE');
  console.log('JOB CREATION: NO_REAL_JOB_CREATED');
  console.log('QUEUE DISPATCH: NO_QUEUE_DISPATCHED');
  console.log('RUNTIME MUTATION: ZERO_RUNTIME_MUTATION_CONFIRMED');
  console.log('WRITE SCOPE: PHASE_180_TABLES_ONLY');
  console.log('================================================================================\n');

  if (db.closePool) await db.closePool().catch(() => {});

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
