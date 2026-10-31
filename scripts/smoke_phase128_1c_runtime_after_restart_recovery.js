'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128.1c: Service After-Restart Recovery Verification ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const LimitedBetaRuntimeService = require('../src/api/services/limitedBetaRuntimeService');
const svc = new LimitedBetaRuntimeService();

(async () => {
  // Mock DB to simulate recovered state
  svc._db = {
    query: async (sql, params) => {
      if (sql.includes('schema_versions')) {
        return [{ version: '075_phase128_1_runtime_persistence_restart_recovery_drill' }];
      }
      if (sql.includes('limited_beta_runtime_scope_policies')) {
        return [{ policy_id: 'policy_123', gate_id: 'gate_123', policy_name: 'Scope A', allowed_features_json: '["BETA_FEATURE"]' }];
      }
      if (sql.includes('limited_beta_runtime_access_grants')) {
        return [{ grant_id: 'grant_123', gate_id: 'gate_123', cohort_id: 'cohort_123', participant_id: 'part_123', tenant_id: 'tenant_123', scope_policy_id: 'policy_123', revoked: 0 }];
      }
      if (sql.includes('limited_beta_runtime_sessions')) {
        return [{ session_id: 'session_123', gate_id: 'gate_123', cohort_id: 'cohort_123', participant_id: 'part_123', tenant_id: 'tenant_123', scope_policy_id: 'policy_123', access_status: 'ALLOWED' }];
      }
      return [];
    }
  };

  // 1. Verify after restart state reloads DB state and succeeds
  const res = await svc.verifyRuntimeStateAfterRestart('gate_123');
  assert(res.ok === true, "Recovery verification succeeds when grants and policies exist in DB");
  assert(res.verification.policiesRecovered === true, "Policies recovered indicator is true");
  assert(res.verification.grantsRecovered === true, "Grants recovered indicator is true");

  // 2. Verify missing state blocks access
  svc._db = {
    query: async (sql, params) => {
      // Empty queries represent missing DB states
      return [];
    }
  };

  const resFail = await svc.verifyRuntimeStateAfterRestart('gate_123');
  assert(resFail.ok === false, "Recovery verification fails when DB tables are empty");

  console.log(`\nSmoke 128.1c: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 128.1c:", err);
  process.exit(1);
});
