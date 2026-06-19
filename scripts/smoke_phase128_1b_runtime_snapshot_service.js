'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128.1b: Service Before-Restart Snapshot Verification ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const LimitedBetaRuntimeService = require('../src/api/services/limitedBetaRuntimeService');
const svc = new LimitedBetaRuntimeService();

(async () => {
  // 1. Verify new methods exist
  const methods = [
    'createRuntimeRestartDrill', 'snapshotRuntimeStateBeforeRestart',
    'verifyRuntimeStateAfterRestart', 'compareRuntimeRestartSnapshot',
    'verifyKillSwitchAfterRestart', 'verifyAccessGrantAfterRestart',
    'verifyAccessDenialAfterRestart', 'verifyScopePolicyAfterRestart',
    'verifySessionStateAfterRestart', 'verifyEvidencePackAfterRestart',
    'buildRuntimeRestartRecoveryEvidencePack', 'getRuntimeRestartRecoveryAuditTimeline'
  ];

  for (const m of methods) {
    assert(typeof svc[m] === 'function', `Service method exists: ${m}`);
  }

  // Mock DB for snapshotting
  svc._db = {
    query: async (sql, params) => {
      if (sql.includes('schema_versions')) {
        return [{ version: '075_phase128_1_runtime_persistence_restart_recovery_drill' }];
      }
      if (sql.includes('limited_beta_runtime_scope_policies')) {
        return [{ policy_id: 'policy_123', gate_id: 'gate_123', policy_name: 'Scope A', allowed_features_json: '["BETA_FEATURE"]' }];
      }
      if (sql.includes('limited_beta_runtime_access_grants')) {
        return [{ grant_id: 'grant_123', gate_id: 'gate_123', participant_id: 'part_123', invite_code: 'sensitiveInvite123' }];
      }
      if (sql.includes('limited_beta_runtime_sessions')) {
        return [{ session_id: 'session_123', gate_id: 'gate_123', session_secret: 'sensitiveSecret123', token: 'sensitiveToken123' }];
      }
      return [];
    }
  };

  // 2. Snapshot state before restart
  const res = await svc.snapshotRuntimeStateBeforeRestart('gate_123');
  assert(res.ok === true, "Snapshot state succeeds");
  assert(typeof res.snapshot_hash === 'string' && res.snapshot_hash.length === 64, "Snapshot hash is a valid SHA-256 string");

  // 3. Secret Redaction checks
  const snapshotStr = JSON.stringify(res.redacted_snapshot);
  assert(!snapshotStr.includes('sensitiveInvite123'), "Snapshot redacts invite codes");
  assert(!snapshotStr.includes('sensitiveSecret123'), "Snapshot redacts session secrets");
  assert(!snapshotStr.includes('sensitiveToken123'), "Snapshot redacts session tokens");
  assert(snapshotStr.includes('[REDACTED]'), "Redaction tag is present in snapshot data");

  console.log(`\nSmoke 128.1b: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 128.1b:", err);
  process.exit(1);
});
