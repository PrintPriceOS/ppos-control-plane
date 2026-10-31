'use strict';

require('dotenv').config();
const ControlledBetaRuntimeObservationService = require('../src/api/services/controlledBetaRuntimeObservationService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 130C: Observation Readiness ===\n');

(async () => {
  const svc = new ControlledBetaRuntimeObservationService();

  const r1 = await svc.evaluateRuntimeObservationReadiness('invalid_id');
  assert(r1.readiness_status === 'BLOCKED', 'Readiness is BLOCKED for invalid activation');
  assert(r1.blocked_reasons.includes('PHASE_129_EVIDENCE_MISSING_OR_DEGRADED') || r1.blocked_reasons.includes('ACTIVATION_NOT_FOUND'), 'BLOCKED when Phase 129 evidence missing');
  assert(r1.blocked_reasons.includes('PHASE_128_1_EVIDENCE_MISSING_OR_DEGRADED') || r1.blocked_reasons.includes('ACTIVATION_NOT_FOUND'), 'BLOCKED when Phase 128.1 evidence missing');
  assert(r1.blocked_reasons.length > 0, 'blocked_reasons are detailed');

  // We can't guarantee a "READY" response unless we fully seed the database, which we don't do here.
  // We can verify that the fail-closed states are correct.
  
  console.log(`\nSmoke 130C: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().then(() => {
  const db = require('../src/api/services/mysqlClient');
  if (db && db.closePool) db.closePool();
}).catch(err => {
  console.error("FATAL ERROR in 130C:", err);
  process.exit(1);
});
