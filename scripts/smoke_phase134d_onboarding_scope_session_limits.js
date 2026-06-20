'use strict';

const service = require('../src/api/services/controlledBetaInviteAcceptanceService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 134D: Onboarding Scope & Session Limits ===');

  process.env.DB_UNREACHABLE = 'true';

  const gateId = 'agate_test_134d';
  const inviteRecordId = 'inv_test_134d';

  // Setup gate
  await service.createInviteAcceptanceGate({
    acceptance_gate_id: gateId,
    invite_record_id: inviteRecordId,
    tenant_id: 'tenant_beta_01',
    cohort_id: 'cohort_beta_01'
  });

  // Bind identity
  const part = await service.bindParticipantIdentity(gateId, 'ext_user_134d', 'user@test.com', 'Beta Tester');

  // Test 1: Validates participant scope (tenant/cohort must match gate)
  assert(part.tenant_id === 'tenant_beta_01' && part.cohort_id === 'cohort_beta_01', 'Participant tenant and cohort matches gate');

  // Test 2: Verify defined limits
  const limits = await service.defineOnboardingSessionLimits(gateId, part.participant_id, {
    max_sessions: 2,
    max_concurrent_sessions: 1,
    session_ttl_minutes: 30,
    daily_action_limit: 50,
    feature_scope_json: { readOnly: true }
  });
  assert(limits.max_sessions === 2 && limits.max_concurrent_sessions === 1, 'Session limits defined correctly');

  // Test 3: Verify defined access policy matches approved scope
  const policy = await service.defineOnboardingAccessPolicy(gateId, part.participant_id, {
    policy_status: 'ACTIVE',
    allowed_features_json: ['read'],
    denied_features_json: ['admin'],
    runtime_scope_json: { tenant_id: 'tenant_beta_01', cohort_id: 'cohort_beta_01' }
  });
  assert(policy.runtime_scope_json.tenant_id === 'tenant_beta_01', 'Access policy is bounded to approved tenant');
  assert(policy.runtime_scope_json.cohort_id === 'cohort_beta_01', 'Access policy is bounded to approved cohort');

  // Test 4: Reject runtime scope broadening (if we attempt to define policy for another tenant, the service bounds it back to gate scope)
  const broaderPolicy = await service.defineOnboardingAccessPolicy(gateId, part.participant_id, {
    policy_status: 'ACTIVE',
    allowed_features_json: ['*'],
    runtime_scope_json: { tenant_id: 'tenant_global_broadened', cohort_id: 'cohort_global_broadened' }
  });
  assert(broaderPolicy.runtime_scope_json.tenant_id === 'tenant_beta_01', 'Broadened scope is safely bounded back to the approved tenant scope');

  console.log(`Smoke 134D: Finished. Passed: ${passed}, Failed: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
