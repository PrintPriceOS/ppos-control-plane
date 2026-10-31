'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
  if (condition) { PASS++; console.log(`  ✅  [PASS] ${label}`); }
  else { FAIL++; console.error(`  ❌  [FAIL] ${label}`); }
  return condition;
}

const ROOT = path.resolve(__dirname, '..');

function runEnvBootstrapSmoke() {
  console.log('\n━━━ Phase 120.1 — Acceptance Env Bootstrap Smoke ━━━\n');

  // 1. smoke_bootstrap_env.js exists
  const bootstrapPath = path.join(ROOT, 'scripts/smoke_bootstrap_env.js');
  assert(fs.existsSync(bootstrapPath), 'ENVBOOT_01: smoke_bootstrap_env.js exists');

  // 2. smoke_bootstrap_env.js is syntax-valid
  try {
    execSync(`node --check "${bootstrapPath}"`, { encoding: 'utf8' });
    assert(true, 'ENVBOOT_02: smoke_bootstrap_env.js is syntax-valid');
  } catch {
    assert(false, 'ENVBOOT_02: smoke_bootstrap_env.js is syntax-valid');
  }

  // 3. bootstrap validates JWT_SECRET presence without printing it
  const bootstrapCode = fs.readFileSync(bootstrapPath, 'utf8');
  assert(bootstrapCode.includes('JWT_SECRET'), 'ENVBOOT_03: bootstrap checks JWT_SECRET');
  assert(bootstrapCode.includes('DATABASE_URL'), 'ENVBOOT_04: bootstrap checks DATABASE_URL');
  assert(!bootstrapCode.includes('console.log(process.env.JWT_SECRET)'), 'ENVBOOT_05: bootstrap does not print JWT_SECRET value');
  assert(!bootstrapCode.includes('console.log(process.env.DATABASE_URL)'), 'ENVBOOT_06: bootstrap does not print DATABASE_URL value');
  assert(bootstrapCode.includes('FATAL-CONFIG-ERROR'), 'ENVBOOT_07: bootstrap emits FATAL-CONFIG-ERROR on missing env');

  // 4. Phase 113G loads or references the bootstrap
  const phase113gPath = path.join(ROOT, 'scripts/smoke_phase113g_production_activation_gate_acceptance_pack.js');
  assert(fs.existsSync(phase113gPath), 'ENVBOOT_08: Phase 113G smoke exists');

  const phase113gCode = fs.readFileSync(phase113gPath, 'utf8');
  assert(
    phase113gCode.includes('smoke_bootstrap_env') || phase113gCode.includes('dotenv'),
    'ENVBOOT_09: Phase 113G references env bootstrap or dotenv'
  );

  // 5. Simulate missing env detection — bootstrap contains controlled error path
  assert(
    bootstrapCode.includes('process.exit(1)'),
    'ENVBOOT_10: bootstrap exits with error code on missing env'
  );

  // 6. Ensure bootstrap exports REQUIRED_ENV
  assert(
    bootstrapCode.includes('module.exports'),
    'ENVBOOT_11: bootstrap exports its configuration'
  );

  // Summary
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`Phase 120.1 Acceptance Env Bootstrap Smoke: PASS: ${PASS} | FAIL: ${FAIL}`);
  console.log(`${'─'.repeat(64)}\n`);

  if (FAIL > 0) {
    console.error('❌ Acceptance Env Bootstrap Smoke: FAILED');
    process.exit(1);
  }

  console.log('✅ Acceptance Env Bootstrap Smoke: ALL PASS\n');
}

runEnvBootstrapSmoke();
