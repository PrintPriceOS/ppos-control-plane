'use strict';

const service = require('../src/api/services/controlledBetaRuntimeSessionService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 135E: Runtime Session Lifecycle & Guardrails ===');

  const gateId = 'sg_test_135e';
  const acceptanceGateId = 'agate_test_135e';
  const participantId = 'part_test_135e';
  const tenantId = 'tenant_beta_01';
  const cohortId = 'cohort_beta_01';

  // Seed mock state
  const setupBase = () => {
    service._mockState.gates.clear();
    service._mockState.sessions.clear();
    service._mockState.sessionLimits.clear();

    service.setMockState('gates', gateId, {
      session_gate_id: gateId,
      acceptance_gate_id: acceptanceGateId,
      participant_id: participantId,
      tenant_id: tenantId,
      cohort_id: cohortId,
      gate_status: 'DRAFT', // starts as draft
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
      max_concurrent_sessions: 1, // max concurrent 1 for testing limits
      session_ttl_minutes: 30,
      daily_action_limit: 100,
      feature_scope_json: { allowed: ['feature:read'] }
    });
  };

  // Test 1: Blocks session creation before approval
  setupBase();
  try {
    await service.createControlledRuntimeSession(gateId, 'admin');
    assert(false, 'Should block session creation before approval');
  } catch (e) {
    assert(e.message.includes('SESSION_CREATION_BEFORE_APPROVAL'), 'Blocks session creation before approval');
  }

  // Test 2: Blocks session creation if kill switch active
  setupBase();
  // Approve first
  const gate = service._mockState.gates.get(gateId);
  gate.gate_status = 'APPROVED';
  gate.kill_switch_active = 1; // set kill switch active
  service._mockState.gates.set(gateId, gate);
  try {
    await service.createControlledRuntimeSession(gateId, 'admin');
    assert(false, 'Should block session creation if kill switch active');
  } catch (e) {
    assert(e.message.includes('ACTIVE_KILL_SWITCH_PRESENT'), 'Blocks session creation if kill switch active');
  }

  // Test 3: Concurrent limits check
  setupBase();
  const g = service._mockState.gates.get(gateId);
  g.gate_status = 'APPROVED';
  service._mockState.gates.set(gateId, g);

  const sess1 = await service.createControlledRuntimeSession(gateId, 'admin');
  assert(sess1.runtime_session_id !== undefined, 'First session created');

  try {
    await service.createControlledRuntimeSession(gateId, 'admin');
    assert(false, 'Should block second concurrent session due to limits');
  } catch (e) {
    assert(e.message.includes('ACTIVE_SESSION_LIMIT_EXCEEDED'), 'Blocks when concurrent session limit exceeded');
  }

  // Test 4: Heartbeat on active vs closed sessions
  const hbRes = await service.recordRuntimeSessionHeartbeat(sess1.runtime_session_id, { active: true });
  assert(hbRes.heartbeat_status === 'OK', 'Heartbeat accepted on active session');

  await service.closeRuntimeSession(sess1.runtime_session_id, 'admin', 'user closed');

  try {
    await service.recordRuntimeSessionHeartbeat(sess1.runtime_session_id, { active: true });
    assert(false, 'Heartbeat should fail on closed session');
  } catch (e) {
    assert(e.message.includes('Heartbeat rejected'), 'Heartbeat rejected on closed session');
  }

  console.log(`Smoke 135E: Finished. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
