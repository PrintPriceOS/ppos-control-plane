'use strict';

require('dotenv').config();

const ControlledBetaCohortActivationService = require('../src/api/services/controlledBetaCohortActivationService');
const Phase129ControlledBetaFixture = require('./helpers/phase129ControlledBetaFixture');

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

  let fixture = null;
  if (process.env.DATABASE_URL) {
    fixture = new Phase129ControlledBetaFixture(process.env.DATABASE_URL);
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

  // Define scope
  await svc.defineActivationScope({
    activation_id: actId,
    allowed_features_json: { features: [] }
  });

  // Setup monitoring
  await svc.recordActivationMonitoringEvent({
    activation_id: actId,
    event_type: 'SETUP',
    details: { monitoring: true }
  });

  // Setup support
  await svc.recordActivationSupportEvent({
    activation_id: actId,
    ticket_details: 'support configured'
  });

  // Setup Prerequisites using the DB fixture
  if (fixture) {
    await fixture.setupPrerequisites(actId);
  }

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

  // To reactivate after an incident, we need to clear finding blockers
  // Wait, recordActivationIncidentEvent pauses the activation. Is there a blocker finding?
  // recordActivationIncidentEvent only pauses but does not record a finding.
  // Wait, if it paused, does it need a new readiness check to reactivate? Yes, `resumeControlledCohort` checks readiness.
  // `activateControlledCohort` also checks readiness. Wait, let's use `resumeControlledCohort` as it's more appropriate.
  
  // Reactivate
  await svc.resumeControlledCohort(actId);

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
  if (fixture) {
    await fixture.cleanupPrerequisites();
    await fixture.close();
  }
  if (svc._db && svc._db.closePool) await svc._db.closePool();
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(async err => {
  console.error("FATAL ERROR in 129e:", err);
  process.exit(1);
});
