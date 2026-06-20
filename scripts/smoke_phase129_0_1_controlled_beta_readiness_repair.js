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

console.log('=== Smoke 129.0.1: Controlled Beta Activation Readiness Repair Verification ===\n');

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
    gate_id: 'lbpg_repair_129',
    cohort_id: 'cohort_repair_129',
    tenant_id: 'tenant_repair_129'
  });
  const actId = resCreate.activation.activation_id;

  // 1. Initial Readiness should be BLOCKED
  const resBlocked = await svc.evaluateControlledCohortActivationReadiness(actId);
  assert(!resBlocked.ok && resBlocked.readiness_status === 'BLOCKED', 'Initial activation state is BLOCKED');
  assert(resBlocked.blocked_reasons.length > 0, 'Blocked reasons are correctly reported');

  // 2. Build Readiness
  await svc.defineSessionLimits({ activation_id: actId, max_participants: 5 });
  await svc.addActivationParticipant({
    activation_id: actId,
    participant_id: 'part_repair_129',
    approved: true,
    terms_accepted: true,
    role_boundary_defined: true
  });
  await svc.issueActivationInvite({ activation_id: actId, participant_id: 'part_repair_129' });
  await svc.defineActivationScope({ activation_id: actId, allowed_features_json: { features: [] } });
  await svc.recordActivationMonitoringEvent({ activation_id: actId, event_type: 'SETUP', details: {} });
  await svc.recordActivationSupportEvent({ activation_id: actId, ticket_details: 'support configured' });

  if (fixture) {
    await fixture.setupPrerequisites(actId);
  }

  // 3. Readiness should be READY
  const resReady = await svc.evaluateControlledCohortActivationReadiness(actId);
  assert(resReady.readiness_status === 'READY', 'Activation moves to READY when all governance pre-requisites are met');
  
  // Verify detailed checks
  const c = resReady.checks || {};
  assert(c.phase128_1_verified, 'Check: phase128_1_verified');
  assert(c.phase127_1_verified, 'Check: phase127_1_verified');
  assert(c.activation_exists, 'Check: activation_exists');
  assert(c.gate_bound, 'Check: gate_bound');
  assert(c.cohort_bound, 'Check: cohort_bound');
  assert(c.tenant_bound, 'Check: tenant_bound');
  assert(c.participants_present, 'Check: participants_present');
  assert(c.all_participants_approved, 'Check: all_participants_approved');
  assert(c.terms_accepted, 'Check: terms_accepted');
  assert(c.role_boundaries_defined, 'Check: role_boundaries_defined');
  assert(c.valid_invites_or_access_grants, 'Check: valid_invites_or_access_grants');
  assert(c.activation_scope_defined, 'Check: activation_scope_defined');
  assert(c.session_limits_defined, 'Check: session_limits_defined');
  assert(c.support_escalation_defined, 'Check: support_escalation_defined');
  assert(c.rollback_ready, 'Check: rollback_ready');
  assert(c.monitoring_configured, 'Check: monitoring_configured');
  assert(c.no_unresolved_blocker_findings, 'Check: no_unresolved_blocker_findings');
  assert(c.kill_switch_ready, 'Check: kill_switch_ready');
  assert(c.safety_invariants_disabled, 'Check: safety_invariants_disabled');

  // 4. Create Blocker Finding
  const findingRes = await svc.recordActivationFinding({
    activation_id: actId,
    severity: 'BLOCKER',
    summary: 'Testing finding blocker',
    blocks_runtime: true
  });
  const resBlockedByFinding = await svc.evaluateControlledCohortActivationReadiness(actId);
  assert(resBlockedByFinding.readiness_status === 'BLOCKED', 'Activation is BLOCKED when an unresolved blocker finding exists');
  assert(resBlockedByFinding.blocked_reasons.includes('UNRESOLVED_BLOCKER_FINDINGS'), 'Blocked reasons explicitly list UNRESOLVED_BLOCKER_FINDINGS');

  // 5. Resolve Finding
  await svc.resolveActivationFinding(findingRes.finding_id);
  const resReadyAgain = await svc.evaluateControlledCohortActivationReadiness(actId);
  assert(resReadyAgain.readiness_status === 'READY', 'Activation returns to READY when finding is resolved');

  console.log(`\nSmoke 129.0.1: ${passed} passed, ${failed} failed`);
  if (fixture) {
    await fixture.cleanupPrerequisites();
    await fixture.close();
  }
  if (svc._db && svc._db.closePool) await svc._db.closePool();
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(async err => {
  console.error("FATAL ERROR in 129.0.1:", err);
  process.exit(1);
});
