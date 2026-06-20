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

console.log('=== Phase 133 Invite Issuance Acceptance Pack (133H) ===\n');

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
    'smoke_phase133a_invite_issuance_schema.js',
    'smoke_phase133b_invite_issuance_service.js',
    'smoke_phase133c_invite_issuance_readiness.js',
    'smoke_phase133d_invite_issuance_limits_scope.js',
    'smoke_phase133e_invite_issuance_execution_guardrails.js',
    'smoke_phase133f_invite_issuance_admin_api_ui.js',
    'smoke_phase133g_invite_issuance_evidence_pack.js',
    // Run Phase 132H as dependency if DB is reachable
    ...(hasDb ? ['smoke_phase132h_expansion_preparation_acceptance_pack.js'] : [])
  ];

  const failedSmokes = [];

  for (const script of smokes) {
    console.log(`Running ${script}...`);
    const res = spawnSync(process.execPath, ['-r', 'dotenv/config', `scripts/${script}`], { encoding: 'utf-8', env: { ...process.env } });
    
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
  const svcPath = path.join(__dirname, '../src/api/services/controlledBetaInviteIssuanceService.js');
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
    'participantAutoAddEnabled: true',
    'scopeAutoBroadenEnabled: true',
    'grantRuntimeAccess(',
    'addParticipant(',
    'broadenScope(',
    'enablePublicBeta',
    'enableFullPublic',
    'enableOpenMarketplace',
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

  console.log(`\nSmoke 133H: Finished execution. ${passed} passed, ${failed} failed`);
  if (db && db.closePool) await db.closePool();
  
  if (failed > 0 || failedSmokes.length > 0) {
    if (failedSmokes.length > 0) {
      console.error('\nFAILED_SUBSMOKES:');
      for (const f of failedSmokes) {
        console.error(`* ${f.script}: ${f.reason}`);
      }
    }
    console.error('\nFATAL: Phase 133 Acceptance Pack Failed.');
    process.exit(1);
  } else {
    console.log('\nSUCCESS: Phase 133 Acceptance Pack Passed.');
    process.exit(0);
  }
})().catch(err => {
  console.error('FATAL error in 133H:', err);
  process.exit(1);
});
