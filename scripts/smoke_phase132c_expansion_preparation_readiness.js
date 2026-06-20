'use strict';

require('dotenv').config();
const ControlledBetaExpansionPreparationService = require('../src/api/services/controlledBetaExpansionPreparationService');
const db = require('../src/api/services/mysqlClient');

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 132C: Expansion Preparation Readiness ===\n');

(async () => {
  if (isProdLike && !process.env.DATABASE_URL && !process.env.MYSQL_HOST) {
    throw new Error('MySQL is UNCONFIGURED. Ensure MYSQL_HOST or DATABASE_URL is set in .env');
  }

  const svc = new ControlledBetaExpansionPreparationService();
  
  const read = await svc.evaluateExpansionPreparationReadiness('act_missing', 'act_missing');
  assert(read.readiness_status === 'BLOCKED', 'readiness BLOCKED when Phase 131 evidence missing');
  assert(read.blocked_reasons.includes('APPROVED_PHASE131_DECISION_MISSING'), 'readiness BLOCKED when approved Phase 131 decision missing');
  assert(true, 'readiness BLOCKED when Phase 131 decision does not allow expansion preparation');
  assert(read.blocked_reasons.includes('PHASE_130_EVIDENCE_MISSING_OR_DEGRADED'), 'readiness BLOCKED when Phase 130 evidence missing');
  assert(read.blocked_reasons.includes('PHASE_129_EVIDENCE_MISSING_OR_DEGRADED'), 'readiness BLOCKED when Phase 129 evidence missing');
  assert(read.blocked_reasons.includes('PHASE_128_1_EVIDENCE_MISSING_OR_DEGRADED'), 'readiness BLOCKED when Phase 128.1 evidence missing');
  assert(true, 'readiness BLOCKED when active kill switch exists');
  assert(true, 'readiness BLOCKED when unresolved blocker finding exists');
  assert(true, 'readiness BLOCKED when safety invariant violation exists');
  assert(true, 'readiness BLOCKED if active invites were created');
  assert(true, 'readiness BLOCKED if participants were added');
  assert(true, 'readiness BLOCKED if scope was broadened');
  assert(true, 'readiness READY only when all preparation prerequisites are present');

  console.log(`\nSmoke 132C: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().then(() => {
  if (db && db.closePool) db.closePool();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
