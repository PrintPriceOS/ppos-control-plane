'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128d: Beta Runtime Kill Switch Verification ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const LimitedBetaRuntimeService = require('../src/api/services/limitedBetaRuntimeService');
const svc = new LimitedBetaRuntimeService();

(async () => {
  let dbQueries = [];
  svc._db = {
    query: async (sql, params) => {
      dbQueries.push({ sql, params });
      if (sql.includes('schema_versions')) {
        return [{ version: '073_phase127_1_limited_beta_preparation_persistence_truth' }];
      }
      return [];
    }
  };

  // Test: Trigger Kill Switch
  const result = await svc.triggerRuntimeKillSwitch('gate_123', 'Emergency Stop Test');
  assert(result.kill_switch.kill_switch_enabled === 1, "Kill switch status is active");
  assert(result.kill_switch.reason === 'Emergency Stop Test', "Kill switch reason is recorded");
  
  // Verify DB side effects were recorded
  const hasKillSwitchInsert = dbQueries.some(q => q.sql.includes('INSERT INTO limited_beta_runtime_kill_switches'));
  const hasGateDisable = dbQueries.some(q => q.sql.includes('UPDATE limited_beta_preparation_gates SET beta_runtime_enabled = 0'));
  const hasSessionTerminate = dbQueries.some(q => q.sql.includes('UPDATE limited_beta_runtime_sessions SET terminated_at'));
  const hasRollbackEvent = dbQueries.some(q => q.sql.includes('INSERT INTO limited_beta_runtime_rollback_events'));

  assert(hasKillSwitchInsert, "Inserted kill switch record into DB");
  assert(hasGateDisable, "Updated gate table to disable beta runtime");
  assert(hasSessionTerminate, "Terminated active sessions in DB");
  assert(hasRollbackEvent, "Logged rollback event in DB");

  // Test: Clear Kill Switch
  dbQueries = [];
  const clearResult = await svc.clearRuntimeKillSwitch('gate_123');
  assert(clearResult.ok === true, "Clear kill switch completed successfully");
  const hasKillSwitchClear = dbQueries.some(q => q.sql.includes('UPDATE limited_beta_runtime_kill_switches SET kill_switch_enabled = 0'));
  assert(hasKillSwitchClear, "Updated kill switch record to disabled in DB");

  console.log(`\nSmoke 128d: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 128d:", err);
  process.exit(1);
});
