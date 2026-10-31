'use strict';

require('dotenv').config();

const ControlledBetaCohortActivationService = require('../src/api/services/controlledBetaCohortActivationService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 129g: Controlled Beta Cohort Activation Evidence Pack Verification ===\n');

(async () => {
  const svc = new ControlledBetaCohortActivationService();

  if (!process.env.DATABASE_URL) {
    process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
    process.env.NODE_ENV = 'test';
  }

  const resCreate = await svc.createControlledCohortActivation({
    gate_id: 'lbpg_test_gate_129',
    cohort_id: 'cohort_test_129',
    tenant_id: 'tenant_test_129'
  });
  const actId = resCreate.activation.activation_id;

  const resPack = await svc.buildControlledActivationEvidencePack(actId);
  assert(resPack && resPack.evidence_pack, 'buildControlledActivationEvidencePack returns a valid pack');
  assert(resPack.evidence_pack.evidence_schema_version === '129.0', 'Evidence schema version is 129.0');
  assert(!!resPack.evidence_pack.evidence_integrity_hash, 'Evidence integrity hash is computed and present');

  console.log(`\nSmoke 129g: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  if (svc._db && svc._db.closePool) await svc._db.closePool();
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 129g:", err);
  process.exit(1);
});
