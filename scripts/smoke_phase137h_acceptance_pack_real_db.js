'use strict';

const { spawnSync } = require('child_process');
const db = require('../src/api/services/mysqlClient');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 137 Runtime Activity Review / Cohort Health Decision Gate Acceptance Pack (137H) ===\n');

(async () => {
  const isForceReal = process.env.FORCE_REAL_DB_SMOKE === 'true' || process.env.NODE_ENV === 'production';
  let hasDb = true;

  try {
    await db.query("SELECT 1");
    console.log('Database is reachable.\n');
  } catch (e) {
    hasDb = false;
    if (isForceReal) {
      console.error('REAL_DB_REQUIRED_BUT_UNAVAILABLE');
      console.error('FAIL: Real DB is required but connection failed: ' + e.message);
      process.exit(1);
    }
    console.log('Database connection refused/failed. Mock/fallback mode enabled.\n');
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;
    process.env.DATABASE_URL = '';
    process.env.DB_UNREACHABLE = 'true';
    process.env.ALLOW_SCHEMA_SMOKE_FALLBACK = 'true';
  }

  const smokes = [
    'smoke_phase137a_runtime_activity_review_schema.js',
    'smoke_phase137b_review_aggregation_from_phase136.js',
    'smoke_phase137c_cohort_health_evaluator.js',
    'smoke_phase137d_review_decision_governance.js',
    'smoke_phase137e_evidence_pack_builder.js',
    'smoke_phase137f_admin_api_ui_contract.js',
    'smoke_phase137g_forbidden_scanner.js',
    ...(hasDb ? ['smoke_phase136h_runtime_activity_observation_acceptance_pack.js'] : [])
  ];

  const failedSmokes = [];

  for (const script of smokes) {
    const childEnv = {
      ...process.env,
      FORCE_REAL_DB_SMOKE: process.env.FORCE_REAL_DB_SMOKE,
      ALLOW_SCHEMA_SMOKE_FALLBACK: process.env.ALLOW_SCHEMA_SMOKE_FALLBACK,
      ALLOW_SMOKE_FALLBACK: process.env.ALLOW_SMOKE_FALLBACK,
      NODE_ENV: process.env.NODE_ENV
    };
    if (!hasDb) {
      childEnv.NODE_ENV = 'development';
      childEnv.DB_UNREACHABLE = 'true';
      childEnv.ALLOW_SCHEMA_SMOKE_FALLBACK = 'true';
      childEnv.DATABASE_URL = '';
    }
    const res = spawnSync(process.execPath, ['-r', 'dotenv/config', `scripts/${script}`], { encoding: 'utf-8', env: childEnv });

    if (res.status === 0) {
      assert(true, `${script} passed`);
    } else {
      assert(false, `${script} failed with exit code ${res.status}`);
      if (res.stdout) console.log(res.stdout);
      if (res.stderr) console.error(res.stderr);
      failedSmokes.push({ script, reason: `Exit code ${res.status}` });
    }
  }

  console.log(`\nSmoke 137H: Finished execution. ${passed} passed, ${failed} failed`);
  if (db && db.closePool) await db.closePool();

  if (failed > 0 || failedSmokes.length > 0) {
    process.exit(1);
  } else {
    console.log('\nSUCCESS: Phase 137 Acceptance Pack Passed.');
    process.exit(0);
  }
})().catch(err => {
  console.error('FATAL error in 137H:', err);
  process.exit(1);
});
