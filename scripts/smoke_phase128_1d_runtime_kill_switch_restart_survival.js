'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128.1d: Kill Switch Restart Survival Verification ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const LimitedBetaRuntimeService = require('../src/api/services/limitedBetaRuntimeService');
const svc = new LimitedBetaRuntimeService();

(async () => {
  // Mock DB to simulate active kill switch survived restart
  svc._db = {
    query: async (sql, params) => {
      if (sql.includes('schema_versions')) {
        return [{ version: '075_phase128_1_runtime_persistence_restart_recovery_drill' }];
      }
      if (sql.includes('limited_beta_runtime_kill_switches')) {
        return [{ kill_switch_id: 'ks_123', gate_id: 'gate_123', kill_switch_enabled: 1 }];
      }
      return [];
    }
  };

  // 1. Verify kill switch survival check
  const res = await svc.verifyKillSwitchAfterRestart('drill_123', 'gate_123');
  assert(res.kill_switch_active_after_restart === true, "Kill switch survival is verified active after restart");

  // 2. Verify access evaluation is denied when kill switch is active
  const accessResult = await svc.evaluateRuntimeAccess({
    gate_id: 'gate_123',
    cohort_id: 'cohort_123',
    participant_id: 'part_123',
    tenant_id: 'tenant_123',
    feature_key: 'BETA_FEATURE'
  });
  assert(accessResult.ok === false, "Runtime access is denied when kill switch remains active after restart");
  assert(accessResult.reason === 'GATE_NOT_READY', "Access denial reason is GATE_NOT_READY (kill switch active blocks gate readiness)");

  console.log(`\nSmoke 128.1d: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 128.1d:", err);
  process.exit(1);
});
