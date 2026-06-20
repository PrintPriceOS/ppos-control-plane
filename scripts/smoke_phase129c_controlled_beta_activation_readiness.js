'use strict';

require('dotenv').config();

const ControlledBetaCohortActivationService = require('../src/api/services/controlledBetaCohortActivationService');

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

  // 2. Readiness should now be READY (in memory/test fallback mode or with schema matching)
  const resReady = await svc.evaluateControlledCohortActivationReadiness(actId);
  assert(resReady.readiness_status === 'READY', 'Activation moves to READY when governance pre-requisites are met');

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
  if (failed > 0) process.exit(1);
  if (svc._db && svc._db.closePool) await svc._db.closePool();
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 129c:", err);
  process.exit(1);
});
