'use strict';

process.env.DB_UNREACHABLE = 'true';

const service = require('../src/api/services/controlledBetaRuntimeSessionService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 135D: Runtime Session Limits & Scope ===');

  const gateId = 'sg_test_135d';
  const acceptanceGateId = 'agate_test_135d';
  const participantId = 'part_test_135d';
  const tenantId = 'tenant_beta_01';
  const cohortId = 'cohort_beta_01';

  // Seed mock state
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
  service.setMockState('phase134EvidencePacks', acceptanceGateId, {
    acceptance_gate_id: acceptanceGateId,
    evidence_integrity_hash: 'hash_134_ev'
  });

  // Test 1: Scope-bounding update test
  service.setMockState('phase134Policies', participantId, {
    participant_id: participantId,
    // Provide mismatched tenant in scope json to simulate broadening attempt
    runtime_scope_json: { tenant_id: 'tenant_broadened_attempt', cohort_id: cohortId }
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

  let r = await service.evaluateRuntimeSessionReadiness(gateId);
  assert(r.ok === false && r.blocked_reasons.includes('RUNTIME_SCOPE_TOO_BROAD'), 'Rejects broadened/mismatched runtime scope');

  // Test 2: Unbounded TTL policy
  service.setMockState('phase134Policies', participantId, {
    participant_id: participantId,
    runtime_scope_json: { tenant_id: tenantId, cohort_id: cohortId }
  });
  service.setMockState('sessionLimits', gateId, {
    session_gate_id: gateId,
    participant_id: participantId,
    max_sessions: 5,
    max_concurrent_sessions: 2,
    session_ttl_minutes: 0, // invalid/unbounded TTL
    daily_action_limit: 100,
    feature_scope_json: { allowed: ['feature:read'] }
  });

  r = await service.evaluateRuntimeSessionReadiness(gateId);
  assert(r.ok === false && r.blocked_reasons.includes('SESSION_TTL_UNBOUNDED'), 'Rejects unbounded session TTL');

  console.log(`Smoke 135D: Finished. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
