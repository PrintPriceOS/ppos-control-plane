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

console.log('=== Smoke 129c: Controlled Beta Cohort Activation Readiness Verification ===\n');

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

  // Create new activation
  const resCreate = await svc.createControlledCohortActivation({
    gate_id: 'lbpg_test_gate_129',
    cohort_id: 'cohort_test_129',
    tenant_id: 'tenant_test_129'
  });
  const actId = resCreate.activation.activation_id;

  // 1. Initial readiness should be BLOCKED because no participants, invites, or limits exist
  const resBlocked = await svc.evaluateControlledCohortActivationReadiness(actId);
  assert(!resBlocked.ok && resBlocked.readiness_status === 'BLOCKED', 'Initial activation state is BLOCKED');

  // Add limits
  await svc.defineSessionLimits({
    activation_id: actId,
    max_participants: 5,
    max_sessions_per_participant: 2
  });

  // Add approved participant
  await svc.addActivationParticipant({
    activation_id: actId,
    participant_id: 'part_ready_129',
    approved: true,
    terms_accepted: true,
    role_boundary_defined: true
  });

  // Issue invite
  await svc.issueActivationInvite({
    activation_id: actId,
    participant_id: 'part_ready_129'
  });

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

  // 2. Readiness should now be READY (in memory/test fallback mode or with schema matching)
  const resReady = await svc.evaluateControlledCohortActivationReadiness(actId);
  assert(resReady.readiness_status === 'READY', 'Activation moves to READY when governance pre-requisites are met');

  // Verify all check flags are true
  const checks = resReady.checks || {};
  assert(checks.phase128_1_verified, 'Phase 128.1 Verified');
  assert(checks.phase127_1_verified, 'Phase 127.1 Verified');
  assert(checks.rollback_ready, 'Rollback Ready');
  assert(checks.kill_switch_ready, 'Kill Switch Ready');
  assert(checks.session_limits_defined, 'Session Limits Defined');
  assert(checks.activation_scope_defined, 'Activation Scope Defined');
  assert(checks.safety_invariants_disabled, 'Safety Invariants Disabled');

  // 3. Record a blocker finding
  await svc.recordActivationFinding({
    activation_id: actId,
    severity: 'BLOCKER',
    summary: 'Critical beta gate configuration regression',
    blocks_runtime: true
  });

  const resBlockedByFinding = await svc.evaluateControlledCohortActivationReadiness(actId);
  assert(!resBlockedByFinding.ok && resBlockedByFinding.readiness_status === 'BLOCKED', 'Activation is BLOCKED when unresolved blocker findings exist');

  console.log(`\nSmoke 129c: ${passed} passed, ${failed} failed`);
  if (fixture) {
    await fixture.cleanupPrerequisites();
    await fixture.close();
  }
  if (svc._db && svc._db.closePool) await svc._db.closePool();
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(async err => {
  console.error("FATAL ERROR in 129c:", err);
  process.exit(1);
});
