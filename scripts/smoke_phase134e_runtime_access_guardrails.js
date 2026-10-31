'use strict';

const service = require('../src/api/services/controlledBetaInviteAcceptanceService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 134E: Runtime Access Guardrails ===');

  process.env.DB_UNREACHABLE = 'true';

  const gateId = 'agate_test_134e';
  const inviteRecordId = 'inv_test_134e';

  const crypto = require('crypto');
  const codeHash = crypto.createHash('sha256').update('CLAIM-CODE-134B').digest('hex');
  const tokenHash = crypto.createHash('sha256').update('CLAIM-TOKEN-134B').digest('hex');

  // Setup approved Phase 133 issued invite record dependency
  const mockInvite = {
    invite_record_id: inviteRecordId,
    issuance_gate_id: 'gate_test_134e',
    issuance_batch_id: 'batch_test_134e',
    tenant_id: 'tenant_test_134e',
    cohort_id: 'cohort_test_134e',
    invite_code_hash: codeHash,
    invite_token_hash: tokenHash,
    invite_status: 'ISSUED',
    expires_at: new Date(Date.now() + 24 * 3600 * 1000)
  };
  service.setMockState('phase133Invites', inviteRecordId, mockInvite);
  service.setMockState('phase133Gates', 'gate_test_134e', { gate_status: 'APPROVED' });
  service.setMockState('phase133EvidencePacks', 'gate_test_134e', { evidence_integrity_hash: 'integrity_hash_133' });

  // Setup gate
  await service.createInviteAcceptanceGate({
    acceptance_gate_id: gateId,
    invite_record_id: inviteRecordId,
    issuance_gate_id: 'gate_test_134e',
    issuance_batch_id: 'batch_test_134e',
    tenant_id: 'tenant_test_134e',
    cohort_id: 'cohort_test_134e'
  });

  // Test 1: grantControlledRuntimeAccess blocks before approval or readiness READY
  try {
    await service.grantControlledRuntimeAccess(gateId, 'admin');
    assert(false, 'Runtime access should have blocked before onboarding approval');
  } catch (err) {
    assert(err.message.includes('Readiness is BLOCKED') || err.message.includes('approval'), 'Runtime access blocked before onboarding setup');
  }

  // Setup onboarding items: claim + identity + terms + limits + policy
  await service.verifyInviteClaim(gateId, 'CLAIM-CODE-134B', 'CLAIM-TOKEN-134B', 'hash', '127.0.0.1', 'Mozilla');
  const part = await service.bindParticipantIdentity(gateId, 'ext_user', 'user@test.com', 'Tester');
  await service.recordTermsAcceptance(gateId, part.participant_id, 'v1.0', 'terms_hash', 'admin', 'CLICKWRAP');
  await service.defineOnboardingSessionLimits(gateId, part.participant_id, { max_sessions: 1 });
  await service.defineOnboardingAccessPolicy(gateId, part.participant_id, { allowed_features_json: ['read'] });

  // Submit and approve
  await service.submitOnboardingForApproval(gateId, 'admin');
  await service.approveOnboarding(gateId, 'admin');

  // Test 2: Grant works when all conditions are met
  const grantRes = await service.grantControlledRuntimeAccess(gateId, 'admin');
  assert(grantRes.ok === true && grantRes.runtime_access_granted === true, 'Runtime access granted when all conditions met');

  // Verify status conversions
  const gateRecord = service._mockState.gates.get(gateId);
  assert(gateRecord.runtime_access_granted === 1, 'Gate state records runtime_access_granted');
  const updatedInvite = service._mockState.phase133Invites.get(inviteRecordId);
  assert(updatedInvite.invite_status === 'ACCEPTED', 'Invite record marked ACCEPTED');
  const updatedPart = service._mockState.participants.get(part.participant_id);
  assert(updatedPart.participant_status === 'ACTIVE', 'Participant status active');

  // Test 3: Revocation works
  await service.revokeParticipantOnboarding(gateId, 'admin', 'Security recall');
  const revokedGate = service._mockState.gates.get(gateId);
  assert(revokedGate.runtime_access_granted === 0 && revokedGate.gate_status === 'REVOKED', 'Revocation disables runtime access');
  const revokedPart = service._mockState.participants.get(part.participant_id);
  assert(revokedPart.participant_status === 'REVOKED', 'Participant status marked REVOKED');

  console.log(`Smoke 134E: Finished. Passed: ${passed}, Failed: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
