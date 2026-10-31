'use strict';

const service = require('../src/api/services/controlledBetaInviteAcceptanceService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 134C: Invite Acceptance Readiness ===');

  process.env.DB_UNREACHABLE = 'true';

  const inviteRecordId = 'inv_test_134c';
  const gateId = 'agate_test_134c';

  // Base Gate Setup
  const gateData = {
    acceptance_gate_id: gateId,
    invite_record_id: inviteRecordId,
    issuance_gate_id: 'gate_test_134c',
    issuance_batch_id: 'batch_test_134c',
    tenant_id: 'tenant_test_134c',
    cohort_id: 'cohort_test_134c'
  };

  // Test 1: Blocks without Phase 133 issued invite
  await service.createInviteAcceptanceGate(gateData);
  let read = await service.evaluateInviteAcceptanceReadiness(gateId);
  assert(read.ok === false && read.blocked_reasons.includes('PHASE_133_INVITE_MISSING'), 'Blocks without Phase 133 invite');

  // Setup issued invite but no issuance gate approved
  const crypto = require('crypto');
  const codeHash = crypto.createHash('sha256').update('CLAIM-CODE-134B').digest('hex');
  const tokenHash = crypto.createHash('sha256').update('CLAIM-TOKEN-134B').digest('hex');

  const mockInvite = {
    invite_record_id: inviteRecordId,
    issuance_gate_id: 'gate_test_134c',
    issuance_batch_id: 'batch_test_134c',
    tenant_id: 'tenant_test_134c',
    cohort_id: 'cohort_test_134c',
    invite_code_hash: codeHash,
    invite_token_hash: tokenHash,
    invite_status: 'ISSUED',
    expires_at: new Date(Date.now() + 24 * 3600 * 1000)
  };
  service.setMockState('phase133Invites', inviteRecordId, mockInvite);
  read = await service.evaluateInviteAcceptanceReadiness(gateId);
  assert(read.ok === false && read.blocked_reasons.includes('PHASE_133_ISSUANCE_NOT_APPROVED'), 'Blocks without approved issuance gate');

  // Approve issuance gate but no evidence pack
  service.setMockState('phase133Gates', 'gate_test_134c', { gate_status: 'APPROVED' });
  read = await service.evaluateInviteAcceptanceReadiness(gateId);
  assert(read.ok === false && read.blocked_reasons.includes('PHASE_133_EVIDENCE_MISSING_OR_DEGRADED'), 'Blocks without evidence pack');

  // Setup evidence pack
  service.setMockState('phase133EvidencePacks', 'gate_test_134c', { evidence_integrity_hash: 'integrity_134c' });

  // Test 2: Blocks when invite revoked
  mockInvite.invite_status = 'REVOKED';
  service.setMockState('phase133Invites', inviteRecordId, mockInvite);
  read = await service.evaluateInviteAcceptanceReadiness(gateId);
  assert(read.ok === false && read.blocked_reasons.includes('INVITE_REVOKED'), 'Blocks when invite is revoked');

  // Restore issued status
  mockInvite.invite_status = 'ISSUED';
  service.setMockState('phase133Invites', inviteRecordId, mockInvite);

  // Test 3: Blocks when invite expired
  mockInvite.expires_at = new Date(Date.now() - 1000);
  service.setMockState('phase133Invites', inviteRecordId, mockInvite);
  read = await service.evaluateInviteAcceptanceReadiness(gateId);
  assert(read.ok === false && read.blocked_reasons.includes('INVITE_EXPIRED'), 'Blocks when invite is expired');

  // Restore future expiration
  mockInvite.expires_at = new Date(Date.now() + 24 * 3600 * 1000);
  service.setMockState('phase133Invites', inviteRecordId, mockInvite);

  // Test 4: Blocks when invite already accepted
  mockInvite.invite_status = 'ACCEPTED';
  mockInvite.accepted_at = new Date();
  service.setMockState('phase133Invites', inviteRecordId, mockInvite);
  read = await service.evaluateInviteAcceptanceReadiness(gateId);
  assert(read.ok === false && read.blocked_reasons.includes('INVITE_ALREADY_ACCEPTED'), 'Blocks when invite is already accepted');

  // Restore issued status
  mockInvite.invite_status = 'ISSUED';
  mockInvite.accepted_at = null;
  service.setMockState('phase133Invites', inviteRecordId, mockInvite);

  // Test 5: Blocks when claim not verified
  read = await service.evaluateInviteAcceptanceReadiness(gateId);
  assert(read.ok === false && read.blocked_reasons.includes('CLAIM_NOT_VERIFIED'), 'Blocks when claim not verified');

  // Verify claim
  await service.verifyInviteClaim(gateId, 'CLAIM-CODE-134B', 'CLAIM-TOKEN-134B', 'hash', '127.0.0.1', 'Mozilla');

  // Test 6: Blocks when identity not bound
  read = await service.evaluateInviteAcceptanceReadiness(gateId);
  assert(read.ok === false && read.blocked_reasons.includes('PARTICIPANT_IDENTITY_NOT_BOUND'), 'Blocks when identity not bound');

  // Bind identity
  const part = await service.bindParticipantIdentity(gateId, 'ext_01', 'email@test.com', 'Beta Tester');

  // Test 7: Blocks when terms not accepted
  read = await service.evaluateInviteAcceptanceReadiness(gateId);
  assert(read.ok === false && read.blocked_reasons.includes('TERMS_NOT_ACCEPTED'), 'Blocks when terms not accepted');

  // Accept terms
  await service.recordTermsAcceptance(gateId, part.participant_id, 'v1.0', 'terms_hash_134b', 'admin', 'CLICKWRAP');

  // Test 8: Blocks when session limits missing
  read = await service.evaluateInviteAcceptanceReadiness(gateId);
  assert(read.ok === false && read.blocked_reasons.includes('SESSION_LIMITS_MISSING'), 'Blocks when session limits missing');

  // Define limits
  await service.defineOnboardingSessionLimits(gateId, part.participant_id, {
    max_sessions: 1,
    max_concurrent_sessions: 1,
    session_ttl_minutes: 60,
    daily_action_limit: 100
  });

  // Test 9: Blocks when access policy missing
  read = await service.evaluateInviteAcceptanceReadiness(gateId);
  assert(read.ok === false && read.blocked_reasons.includes('ACCESS_POLICY_MISSING'), 'Blocks when access policy missing');

  // Define policy
  await service.defineOnboardingAccessPolicy(gateId, part.participant_id, {
    allowed_features_json: ['read'],
    denied_features_json: ['admin']
  });

  // Test 10: Blocks without onboarding approval before runtime access
  read = await service.evaluateInviteAcceptanceReadiness(gateId);
  assert(read.ok === false && read.blocked_reasons.includes('RUNTIME_ACCESS_BEFORE_APPROVAL'), 'Blocks without onboarding approval');

  // Submit and approve onboarding
  await service.submitOnboardingForApproval(gateId, 'admin');
  await service.approveOnboarding(gateId, 'admin');

  // Test 11: Blocks when active kill switch present
  const gateRecord = service._mockState.gates.get(gateId);
  gateRecord.kill_switch_active = 1;
  service.setMockState('gates', gateId, gateRecord);
  read = await service.evaluateInviteAcceptanceReadiness(gateId);
  assert(read.ok === false && read.blocked_reasons.includes('ACTIVE_KILL_SWITCH_PRESENT'), 'Blocks when active kill switch is present');
  gateRecord.kill_switch_active = 0;
  service.setMockState('gates', gateId, gateRecord);

  // Test 12: Blocks with unresolved blocker findings
  await service.recordOnboardingFinding(gateId, 'BLOCKER', 'finding_01', { reason: 'Test' });
  read = await service.evaluateInviteAcceptanceReadiness(gateId);
  assert(read.ok === false && read.blocked_reasons.includes('UNRESOLVED_BLOCKER_FINDINGS'), 'Blocks with open blocker findings');

  // Resolve finding
  const findings = Array.from(service._mockState.findings.values());
  await service.resolveOnboardingFinding(findings[0].finding_id, 'admin');

  // Test 13: READY only when all prerequisites are present
  read = await service.evaluateInviteAcceptanceReadiness(gateId);
  assert(read.ok === true && read.readiness_status === 'READY', 'READY when all prerequisites are met');

  // Test 14: Blocks if safety flags enabled
  const safetyFlags = [
    'full_public_enabled',
    'open_marketplace_enabled',
    'public_signup_enabled',
    'public_beta_enabled',
    'payment_execution_enabled',
    'provider_external_submission_enabled',
    'source_mutation_enabled',
    'auto_onboarding_enabled'
  ];
  for (const flag of safetyFlags) {
    gateRecord[flag] = 1;
    service.setMockState('gates', gateId, gateRecord);
    read = await service.evaluateInviteAcceptanceReadiness(gateId);
    assert(read.ok === false, `Blocks when safety flag ${flag} is active`);
    gateRecord[flag] = 0;
    service.setMockState('gates', gateId, gateRecord);
  }

  console.log(`Smoke 134C: Finished. Passed: ${passed}, Failed: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
