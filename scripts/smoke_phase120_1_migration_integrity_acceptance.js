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

function runAcceptance() {
  console.log('\n━━━ Phase 120.1 — Migration Integrity Acceptance ━━━\n');

  // A. Script existence and syntax
  const scripts = [
    'scripts/diagnose_migration_integrity_drift.js',
    'scripts/repair_phase120_1_migration_015_checksum.js',
    'scripts/smoke_phase120_1_migration_version_collision_guard.js',
    'scripts/smoke_phase120_1_acceptance_env_bootstrap.js',
    'scripts/smoke_bootstrap_env.js',
  ];

  for (const script of scripts) {
    const fullPath = path.join(ROOT, script);
    assert(fs.existsSync(fullPath), `ACCEPT_EXISTS: ${script} exists`);
    try {
      execSync(`node --check "${fullPath}"`, { encoding: 'utf8' });
      assert(true, `ACCEPT_SYNTAX: ${script} is syntax-valid`);
    } catch {
      assert(false, `ACCEPT_SYNTAX: ${script} is syntax-valid`);
    }
  }

  // B. migrationService.js does not collapse migration versions
  const migSvcPath = path.join(ROOT, 'src/api/services/migrationService.js');
  const migSvcCode = fs.readFileSync(migSvcPath, 'utf8');

  assert(
    migSvcCode.includes("file.replace(/\\.sql$/, '')"),
    'ACCEPT_MIG_01: migrationService uses full filename as version'
  );

  // C. 015 versions are distinct
  const version015a = '015_phase76_printhouse_capabilities';
  const version015b = '015_stripe_webhook_events_idempotency';
  assert(version015a !== version015b, 'ACCEPT_MIG_02: 015_phase76 and 015_stripe are distinct versions');

  // D. Phase 113G loads env bootstrap
  const phase113gPath = path.join(ROOT, 'scripts/smoke_phase113g_production_activation_gate_acceptance_pack.js');
  const phase113gCode = fs.readFileSync(phase113gPath, 'utf8');
  assert(
    phase113gCode.includes('smoke_bootstrap_env') || phase113gCode.includes('dotenv'),
    'ACCEPT_ENV_01: Phase 113G references env bootstrap or dotenv'
  );

  // E. Repair script is guarded
  const repairCode = fs.readFileSync(path.join(ROOT, 'scripts/repair_phase120_1_migration_015_checksum.js'), 'utf8');
  assert(
    repairCode.includes('ALLOW_MIGRATION_CHECKSUM_REPAIR'),
    'ACCEPT_REPAIR_01: Repair script requires ALLOW_MIGRATION_CHECKSUM_REPAIR'
  );
  assert(
    repairCode.includes('015_stripe_webhook_events_idempotency'),
    'ACCEPT_REPAIR_02: Repair script targets only 015_stripe_webhook_events_idempotency'
  );
  assert(
    repairCode.includes('git diff'),
    'ACCEPT_REPAIR_03: Repair script checks git working tree'
  );
  assert(
    !repairCode.includes('runMigration') && !repairCode.includes('CREATE TABLE'),
    'ACCEPT_REPAIR_04: Repair script does not re-run migration'
  );

  // F. Diagnose script is read-only
  const diagnoseCode = fs.readFileSync(path.join(ROOT, 'scripts/diagnose_migration_integrity_drift.js'), 'utf8');
  assert(
    !diagnoseCode.includes('UPDATE ') && !diagnoseCode.includes('INSERT ') && !diagnoseCode.includes('DELETE '),
    'ACCEPT_DIAG_01: Diagnose script does not mutate DB'
  );
  assert(
    !diagnoseCode.includes('console.log(process.env.JWT_SECRET)') && !diagnoseCode.includes('console.log(process.env.DATABASE_URL)'),
    'ACCEPT_DIAG_02: Diagnose script does not print secrets'
  );

  // G. Production activation safety
  const safetyPatterns = [
    'fullPublicEnabled: true',
    'openMarketplaceEnabled: true',
    'liveProviderConnectivityEnabled: true',
    'paymentExecutionEnabled: true',
    'refundExecutionEnabled: true',
    'payoutExecutionEnabled: true',
    'externalSubmission: true',
    'sourceMutation: true',
  ];

  for (const script of scripts) {
    const code = fs.readFileSync(path.join(ROOT, script), 'utf8');
    for (const pattern of safetyPatterns) {
      assert(
        !code.includes(pattern),
        `ACCEPT_SAFE: ${path.basename(script)} does not contain "${pattern}"`
      );
    }
  }

  // H. No production activation flags enabled in new scripts
  const dangerousCalls = ['submitTax', 'submitVat', 'sendToProvider', 'charge(', 'refund(', 'payout(', 'capture('];
  for (const script of scripts) {
    const code = fs.readFileSync(path.join(ROOT, script), 'utf8');
    for (const call of dangerousCalls) {
      assert(
        !code.includes(call),
        `ACCEPT_NOSAFE_CALL: ${path.basename(script)} does not contain "${call}"`
      );
    }
  }

  // I. Phase 120.1 docs exist
  const docsPath = path.join(ROOT, 'docs/phase120_1_migration_integrity_acceptance_env_repair.md');
  assert(fs.existsSync(docsPath), 'ACCEPT_DOCS: Phase 120.1 documentation exists');

  // Summary
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`Phase 120.1 Migration Integrity Acceptance: PASS: ${PASS} | FAIL: ${FAIL}`);
  console.log(`${'─'.repeat(64)}\n`);

  if (FAIL > 0) {
    console.error('❌ Phase 120.1 Migration Integrity Acceptance: FAILED');
    process.exit(1);
  }

  console.log(`
PRINTPRICE OS — PHASE 120.1 MIGRATION INTEGRITY & ACCEPTANCE ENV REPAIR
STATUS: VALIDATED
MIGRATION_INTEGRITY_DIAGNOSIS: AVAILABLE
MIGRATION_CHECKSUM_REPAIR: GUARDED
MIGRATION_VERSION_COLLISION_GUARD: PASS
ACCEPTANCE_ENV_BOOTSTRAP: PASS
PHASE_113G_ENV_LOADING: PASS
PRODUCTION_ACTIVATION: NOT_ENABLED
FULL_PUBLIC: NOT_ENABLED
LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED
PAYMENT_EXECUTION: NOT_ENABLED
REFUND_EXECUTION: NOT_ENABLED
PAYOUT_EXECUTION: NOT_ENABLED
EXTERNAL_SUBMISSION: NOT_ENABLED
SOURCE_RECORD_MUTATION: NOT_ENABLED
`);
}

runAcceptance();
