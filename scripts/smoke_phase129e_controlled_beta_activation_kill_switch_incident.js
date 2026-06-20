'use strict';

require('dotenv').config();

const ControlledBetaCohortActivationService = require('../src/api/services/controlledBetaCohortActivationService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 129e: Controlled Beta Cohort Activation Kill Switch & Incidents Verification ===\n');

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

  // Define limits, participants and invites to satisfy readiness
  await svc.defineSessionLimits({ activation_id: actId });
  await svc.addActivationParticipant({
    activation_id: actId,
    participant_id: 'part_kill_129',
    approved: true,
    terms_accepted: true,
    role_boundary_defined: true
  });
  await svc.issueActivationInvite({ activation_id: actId, participant_id: 'part_kill_129' });

  // Activate
  await svc.activateControlledCohort(actId);

  // 1. Blocker / Critical Incident event should automatically PAUSE activation
  await svc.recordActivationIncidentEvent({
    activation_id: actId,
    incident_type: 'SECURITY_BREACH_SUSPECTED',
    severity: 'BLOCKER',
    summary: 'Possible unauthorized access attempt detected'
  });

  let activationState = svc._activations.get(actId);
  if (svc._db) {
    const rows = await svc._dbRead("SELECT * FROM controlled_beta_cohort_activations WHERE activation_id = ?", [actId]);
    if (rows && rows.length > 0) activationState = rows[0];
  }
  
  assert(activationState.activation_status === 'PAUSED' || activationState.activation_status === 'TERMINATED', 'Critical/Blocker incident automatically pauses activation');

  // Reactivate
  await svc.activateControlledCohort(actId);

  // 2. Kill switch trigger must pause activation
  await svc.triggerActivationKillSwitch(actId, 'Admin emergency trigger');

  if (svc._db) {
    const rows = await svc._dbRead("SELECT * FROM controlled_beta_cohort_activations WHERE activation_id = ?", [actId]);
    if (rows && rows.length > 0) activationState = rows[0];
  } else {
    activationState = svc._activations.get(actId);
  }
  
  assert(activationState.activation_status === 'PAUSED' || activationState.activation_status === 'TERMINATED', 'Kill switch trigger pauses activation');

  console.log(`\nSmoke 129e: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  if (svc._db && svc._db.closePool) await svc._db.closePool();
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 129e:", err);
  process.exit(1);
});
