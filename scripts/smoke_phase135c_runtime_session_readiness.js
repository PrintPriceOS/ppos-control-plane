'use strict';

const service = require('../src/api/services/controlledBetaRuntimeSessionService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 135C: Runtime Session Readiness ===');

  const gateId = 'sg_test_135c';
  const acceptanceGateId = 'agate_test_135c';
  const participantId = 'part_test_135c';
  const tenantId = 'tenant_beta_01';
  const cohortId = 'cohort_beta_01';

  // Helper to reset mock state
  const resetMock = () => {
    service._mockState.gates.clear();
    service._mockState.sessionLimits.clear();
    service._mockState.phase134Gates.clear();
    service._mockState.phase134Participants.clear();
    service._mockState.phase134Terms.clear();
    service._mockState.phase134Policies.clear();
    service._mockState.phase134EvidencePacks.clear();
  };

  // Setup valid base
  const setupValidBase = () => {
    resetMock();
    service.setMockState('gates', gateId, {
      session_gate_id: gateId,
      acceptance_gate_id: acceptanceGateId,
      participant_id: participantId,
      tenant_id: tenantId,
      cohort_id: cohortId,
      gate_status: 'APPROVED',
      kill_switch_active: 0,
      manual_approval_required: 1,
      auto_session_creation_enabled: 0
    });
    service.setMockState('phase134Gates', acceptanceGateId, {
      acceptance_gate_id: acceptanceGateId,
      onboarding_approved: 1,
      tenant_id: tenantId,
      cohort_id: cohortId,
      participant_id: participantId
    });
    service.setMockState('phase134Participants', participantId, {
      participant_id: participantId,
      participant_external_ref_hash: 'hash_ext',
      participant_email_hash: 'hash_email',
      participant_status: 'ACTIVE'
    });
    service.setMockState('phase134Terms', participantId, {
      participant_id: participantId,
      terms_version: 'v1.0'
    });
    service.setMockState('phase134Policies', participantId, {
      participant_id: participantId,
      runtime_scope_json: { tenant_id: tenantId, cohort_id: cohortId }
    });
    service.setMockState('phase134EvidencePacks', acceptanceGateId, {
      acceptance_gate_id: acceptanceGateId,
      evidence_integrity_hash: 'hash_134_ev'
    });
    service.setMockState('sessionLimits', gateId, {
      session_gate_id: gateId,
      participant_id: participantId,
      max_sessions: 5,
      max_concurrent_sessions: 2,
      session_ttl_minutes: 30,
      daily_action_limit: 100,
      feature_scope_json: { allowed: ['feature:read'] }
    });
  };

  // Test 1: Blocks without Phase 134 acceptance
  setupValidBase();
  service._mockState.phase134Gates.clear();
  let r = await service.evaluateRuntimeSessionReadiness(gateId);
  assert(r.ok === false && r.blocked_reasons.includes('PHASE_134_ACCEPTANCE_MISSING'), 'Blocks without Phase 134 acceptance');

  // Test 2: Blocks when onboarding not approved
  setupValidBase();
  const acc = service._mockState.phase134Gates.get(acceptanceGateId);
  acc.onboarding_approved = 0;
  service._mockState.phase134Gates.set(acceptanceGateId, acc);
  r = await service.evaluateRuntimeSessionReadiness(gateId);
  assert(r.ok === false && r.blocked_reasons.includes('PHASE_134_ONBOARDING_NOT_APPROVED'), 'Blocks when onboarding not approved');

  // Test 3: Blocks when terms not accepted
  setupValidBase();
  service._mockState.phase134Terms.clear();
  r = await service.evaluateRuntimeSessionReadiness(gateId);
  assert(r.ok === false && r.blocked_reasons.includes('TERMS_NOT_ACCEPTED'), 'Blocks when terms not accepted');

  // Test 4: Blocks when participant is revoked
  setupValidBase();
  const part = service._mockState.phase134Participants.get(participantId);
  part.participant_status = 'REVOKED';
  service._mockState.phase134Participants.set(participantId, part);
  r = await service.evaluateRuntimeSessionReadiness(gateId);
  assert(r.ok === false && r.blocked_reasons.includes('PARTICIPANT_REVOKED'), 'Blocks when participant is revoked');

  // Test 5: Blocks when session limits are missing
  setupValidBase();
  service._mockState.sessionLimits.clear();
  r = await service.evaluateRuntimeSessionReadiness(gateId);
  assert(r.ok === false && r.blocked_reasons.includes('SESSION_LIMITS_MISSING'), 'Blocks when session limits are missing');

  // Test 6: Blocks when active kill switch is present
  setupValidBase();
  const gt = service._mockState.gates.get(gateId);
  gt.kill_switch_active = 1;
  service._mockState.gates.set(gateId, gt);
  r = await service.evaluateRuntimeSessionReadiness(gateId);
  assert(r.ok === false && r.blocked_reasons.includes('ACTIVE_KILL_SWITCH_PRESENT'), 'Blocks when active kill switch is present');

  // Test 7: Ready when all prerequisites are met
  setupValidBase();
  r = await service.evaluateRuntimeSessionReadiness(gateId);
  assert(r.ok === true, 'READY when all prerequisites are met');

  // Test 8: Blocks with active safety flags
  const flags = [
    'full_public_enabled',
    'open_marketplace_enabled',
    'public_signup_enabled',
    'public_beta_enabled',
    'payment_execution_enabled',
    'provider_external_submission_enabled',
    'source_mutation_enabled'
  ];

  for (const flag of flags) {
    setupValidBase();
    const g = service._mockState.gates.get(gateId);
    g[flag] = 1;
    service._mockState.gates.set(gateId, g);
    r = await service.evaluateRuntimeSessionReadiness(gateId);
    assert(r.ok === false, `Blocks when safety flag ${flag} is active`);
  }

  console.log(`Smoke 135C: Finished. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
