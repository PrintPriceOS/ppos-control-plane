'use strict';

require('dotenv').config();

const ControlledBetaCohortActivationService = require('../src/api/services/controlledBetaCohortActivationService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 129b: Controlled Beta Cohort Activation Service Verification ===\n');

(async () => {
  const svc = new ControlledBetaCohortActivationService();

  // Override DB availability if running in memory test mode
  if (!process.env.DATABASE_URL) {
    process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
    process.env.NODE_ENV = 'test';
  }

  // Create activation
  const resCreate = await svc.createControlledCohortActivation({
    gate_id: 'lbpg_test_gate_129',
    cohort_id: 'cohort_test_129',
    tenant_id: 'tenant_test_129'
  });
  assert(resCreate && resCreate.activation, 'createControlledCohortActivation works');
  const actId = resCreate.activation.activation_id;

  // Bind tests
  const resBindGate = await svc.bindActivationToGate(actId, 'lbpg_new_gate');
  assert(resBindGate.ok, 'bindActivationToGate works');

  const resBindCohort = await svc.bindActivationToCohort(actId, 'cohort_new_129');
  assert(resBindCohort.ok, 'bindActivationToCohort works');

  const resBindTenant = await svc.bindActivationToTenant(actId, 'tenant_new_129');
  assert(resBindTenant.ok, 'bindActivationToTenant works');

  // Participant tests
  const resPart = await svc.addActivationParticipant({
    activation_id: actId,
    participant_id: 'part_user_129',
    approved: true,
    terms_accepted: true,
    role_boundary_defined: true
  });
  assert(resPart && resPart.participant, 'addActivationParticipant works');

  // Invites
  const resInvite = await svc.issueActivationInvite({
    activation_id: actId,
    participant_id: 'part_user_129'
  });
  assert(resInvite && resInvite.invite, 'issueActivationInvite works');

  const resRevoke = await svc.revokeActivationInvite(resInvite.invite.invite_id);
  assert(resRevoke.ok, 'revokeActivationInvite works');

  // Define Scope & Limits
  const resScope = await svc.defineActivationScope({
    activation_id: actId,
    allowed_features_json: ['CUSTOMER_PORTAL_VIEW_ONLY']
  });
  assert(resScope.ok, 'defineActivationScope works');

  const resLimits = await svc.defineSessionLimits({
    activation_id: actId,
    max_participants: 5,
    max_sessions_per_participant: 2
  });
  assert(resLimits && resLimits.limits, 'defineSessionLimits works');

  // Access check
  const resAccess = await svc.evaluateParticipantActivationAccess({
    activation_id: actId,
    participant_id: 'part_user_129',
    feature_key: 'CUSTOMER_PORTAL_VIEW_ONLY'
  });
  assert(resAccess.ok, 'evaluateParticipantActivationAccess grants access to approved feature');

  // Forbidden features
  const resForbidden = await svc.evaluateParticipantActivationAccess({
    activation_id: actId,
    participant_id: 'part_user_129',
    feature_key: 'PAYMENT_CAPTURE'
  });
  assert(!resForbidden.ok && resForbidden.reason === 'FORBIDDEN_FEATURE', 'evaluateParticipantActivationAccess blocks forbidden features');

  // Clean up participant
  const resRemovePart = await svc.removeActivationParticipant('part_user_129');
  assert(resRemovePart.ok, 'removeActivationParticipant works');

  console.log(`\nSmoke 129b: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  if (svc._db && svc._db.closePool) await svc._db.closePool();
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 129b:", err);
  process.exit(1);
});
