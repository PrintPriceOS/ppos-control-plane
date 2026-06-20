'use strict';

const { spawnSync } = require('child_process');
const db = require('../src/api/services/mysqlClient');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 136 Runtime Activity Observation Acceptance Pack (136H) ===\n');

(async () => {
  const isForceReal = process.env.FORCE_REAL_DB_SMOKE === 'true' || process.env.NODE_ENV === 'production';
  let hasDb = true;

  try {
    await db.query("SELECT 1");
    console.log('Database is reachable. Running sub-smokes in production-like mode.\n');
  } catch (e) {
    hasDb = false;
    if (isForceReal) {
      console.error('REAL_DB_REQUIRED_BUT_UNAVAILABLE');
      console.error('FAIL: Real DB is required but connection failed: ' + e.message);
      process.exit(1);
    }
    console.log('Database connection refused/failed. Overriding environment to force mock/fallback mode across all sub-smokes.\n');
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;
    process.env.DATABASE_URL = '';
    process.env.DB_UNREACHABLE = 'true';
    process.env.ALLOW_SCHEMA_SMOKE_FALLBACK = 'true';
  }

  const smokes = [
    'smoke_phase136a_runtime_activity_observation_schema.js',
    'smoke_phase136b_runtime_activity_observation_service.js',
    'smoke_phase136c_runtime_activity_observation_readiness.js',
    'smoke_phase136d_runtime_activity_counters_summaries.js',
    'smoke_phase136e_runtime_activity_observation_guardrails.js',
    'smoke_phase136f_runtime_activity_admin_api_ui.js',
    'smoke_phase136g_runtime_activity_evidence_pack.js',
    // Run Phase 135H as dependency if DB is reachable
    ...(hasDb ? ['smoke_phase135h_runtime_session_acceptance_pack.js'] : [])
  ];

  const failedSmokes = [];

  for (const script of smokes) {
    console.log(`Running ${script}...`);
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

    if (res.stdout) console.log(res.stdout);
    if (res.stderr) console.error(res.stderr);

    if (res.status === 0) {
      assert(true, `${script} passed`);
    } else {
      assert(false, `${script} failed with exit code ${res.status}`);
      let reason = `exit code ${res.status}`;
      const failLines = (res.stdout + res.stderr).split('\n').filter(l => l.includes('FAIL:'));
      if (failLines.length > 0) {
        reason = failLines.map(l => l.trim().replace('FAIL:', '').trim()).join(' | ');
      } else {
        const errLines = (res.stderr || '').split('\n').filter(l => l.trim().length > 0);
        if (errLines.length > 0) reason = errLines[0];
      }
      failedSmokes.push({ script, reason });
    }
  }

  // Forbidden pattern scanner
  const svcPath = path.join(__dirname, '../src/api/services/controlledBetaRuntimeActivityObservationService.js');
  let svcCode = fs.readFileSync(svcPath, 'utf8');

  // Strip comments
  svcCode = svcCode.replace(/\/\/.*/g, '');
  svcCode = svcCode.replace(/\/\*[\s\S]*?\*\//g, '');

  const forbidden = [
    'fullPublicEnabled: true',
    'openMarketplaceEnabled: true',
    'publicSignupEnabled: true',
    'publicBetaEnabled: true',
    'paymentExecutionEnabled: true',
    'refundExecutionEnabled: true',
    'payoutExecutionEnabled: true',
    'providerExternalSubmissionEnabled: true',
    'externalTaxSubmissionEnabled: true',
    'externalAccountingSubmissionEnabled: true',
    'sourceMutationEnabled: true',
    'autoExpansionEnabled: true',
    'autoRevocationEnabled: true',
    'autoEnforcementEnabled: true',
    'scopeAutoBroadenEnabled: true',
    'enableFullPublic',
    'enableOpenMarketplace',
    'enablePublicBeta',
    'charge(',
    'capture(',
    'refund(',
    'payout(',
    'sendToProvider',
    'submitTax',
    'submitVat',
    'submitAccounting',
    'console.log(process.env.DATABASE_URL)',
    'console.log(process.env.JWT_SECRET)'
  ];

  for (const pattern of forbidden) {
    assert(!svcCode.includes(pattern), `Forbidden pattern scanner verifies ${pattern} is absent in executable paths`);
  }

  console.log(`\nSmoke 136H: Finished execution. ${passed} passed, ${failed} failed`);
  if (db && db.closePool) await db.closePool();

  if (failed > 0 || failedSmokes.length > 0) {
    if (failedSmokes.length > 0) {
      console.error('\nFAILED_SUBSMOKES:');
      for (const f of failedSmokes) {
        console.error(`* ${f.script}: ${f.reason}`);
      }
    }
    console.error('\nFATAL: Phase 136 Acceptance Pack Failed.');
    process.exit(1);
  } else {
    console.log('\nSUCCESS: Phase 136 Acceptance Pack Passed.');
    process.exit(0);
  }
})().catch(err => {
  console.error('FATAL error in 136H:', err);
  process.exit(1);
});
