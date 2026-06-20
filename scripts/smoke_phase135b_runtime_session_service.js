'use strict';

const service = require('../src/api/services/controlledBetaRuntimeSessionService');
const inviteAcceptanceService = require('../src/api/services/controlledBetaInviteAcceptanceService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 135B: Runtime Session Service ===');

  const funcs = [
    'evaluateRuntimeSessionReadiness',
    'createRuntimeSessionGate',
    'bindAcceptanceToSessionGate',
    'defineRuntimeSessionLimits',
    'submitRuntimeSessionGateForApproval',
    'approveRuntimeSessionGate',
    'rejectRuntimeSessionGate',
    'blockRuntimeSessionGate',
    'runRuntimeSessionGuardrailChecks',
    'createControlledRuntimeSession',
    'evaluateRuntimeFeatureAccess',
    'recordRuntimeSessionHeartbeat',
    'recordRuntimeSessionEvent',
    'closeRuntimeSession',
    'revokeRuntimeSession',
    'revokeParticipantRuntimeSessions',
    'expireRuntimeSessions',
    'recordRuntimeSessionFinding',
    'resolveRuntimeSessionFinding',
    'buildRuntimeSessionEvidencePack',
    'getRuntimeSessionAuditTimeline',
    'getRuntimeSessionDashboardState'
  ];

  for (const fn of funcs) {
    assert(typeof service[fn] === 'function', `Service exports ${fn}()`);
  }

  // Setup basic mock context for testing
  const gateId = 'sg_test_135b';
  const acceptanceGateId = 'agate_test_135b';
  const participantId = 'part_test_135b';
  const tenantId = 'tenant_beta_01';
  const cohortId = 'cohort_beta_01';

  // Seed mocked Phase 134 state
  inviteAcceptanceService.setMockState('gates', acceptanceGateId, {
    acceptance_gate_id: acceptanceGateId,
    onboarding_approved: 1,
    tenant_id: tenantId,
    cohort_id: cohortId,
    participant_id: participantId
  });
  inviteAcceptanceService.setMockState('participants', participantId, {
    participant_id: participantId,
    participant_external_ref_hash: 'hash_ext',
    participant_email_hash: 'hash_email',
    participant_status: 'ACTIVE'
  });
  inviteAcceptanceService.setMockState('terms', participantId, {
    participant_id: participantId,
    terms_version: 'v1.0'
  });
  inviteAcceptanceService.setMockState('accessPolicies', participantId, {
    participant_id: participantId,
    runtime_scope_json: { tenant_id: tenantId, cohort_id: cohortId }
  });
  inviteAcceptanceService.setMockState('evidencePacks', acceptanceGateId, {
    acceptance_gate_id: acceptanceGateId,
    evidence_integrity_hash: 'hash_134_ev'
  });

  // Seed in runtime session service's replica mock state as well
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

  // 1. Create Gate
  const gate = await service.createRuntimeSessionGate({
    session_gate_id: gateId,
    acceptance_gate_id: acceptanceGateId,
    participant_id: participantId,
    tenant_id: tenantId,
    cohort_id: cohortId
  });
  assert(gate.gate_status === 'DRAFT', 'Gate created with DRAFT status');

  // 2. Set limits
  const limits = await service.defineRuntimeSessionLimits(gateId, participantId, {
    max_sessions: 5,
    max_concurrent_sessions: 2,
    session_ttl_minutes: 30,
    daily_action_limit: 100,
    feature_scope_json: { allowed: ['feature:read', 'feature:write'], denied: ['feature:admin'] }
  });
  assert(limits.max_sessions === 5, 'Session limits defined successfully');

  // 3. Submit and Approve
  await service.submitRuntimeSessionGateForApproval(gateId, 'admin');
  const app = await service.approveRuntimeSessionGate(gateId, 'admin');
  assert(app.status === 'APPROVED', 'Gate approved successfully');

  // 4. Create Session
  const sessionRecord = await service.createControlledRuntimeSession(gateId, 'admin');
  assert(sessionRecord.runtime_session_id !== undefined, 'Controlled session created successfully');
  assert(sessionRecord.raw_session_token !== undefined, 'Session token returned once');

  // 5. Evaluate feature access
  const eval1 = await service.evaluateRuntimeFeatureAccess(sessionRecord.runtime_session_id, 'feature:read');
  assert(eval1.ok === true && eval1.access_status === 'GRANTED', 'Access allowed to feature:read');

  const eval2 = await service.evaluateRuntimeFeatureAccess(sessionRecord.runtime_session_id, 'feature:admin');
  assert(eval2.ok === false && eval2.access_status === 'DENIED', 'Access denied to feature:admin');

  // 6. Record heartbeat
  const hb = await service.recordRuntimeSessionHeartbeat(sessionRecord.runtime_session_id, { test: true });
  assert(hb.heartbeat_status === 'OK', 'Session heartbeat recorded successfully');

  // 7. Audit timeline and Evidence Pack
  const timeline = await service.getRuntimeSessionAuditTimeline(gateId);
  assert(timeline.length > 0, 'Audit timeline returns records');

  const evp = await service.buildRuntimeSessionEvidencePack(gateId);
  assert(evp.evidence_schema_version === '135.0', 'Evidence pack built successfully');

  console.log(`Smoke 135B: Finished. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
