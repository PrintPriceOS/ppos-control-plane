'use strict';

const service = require('../src/api/services/controlledBetaInviteAcceptanceService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 134B: Invite Acceptance Service ===');

  // Test Exports
  const requiredFns = [
    'evaluateInviteAcceptanceReadiness',
    'createInviteAcceptanceGate',
    'verifyInviteClaim',
    'bindParticipantIdentity',
    'recordTermsAcceptance',
    'defineOnboardingSessionLimits',
    'defineOnboardingAccessPolicy',
    'runOnboardingGuardrailChecks',
    'submitOnboardingForApproval',
    'approveOnboarding',
    'rejectOnboarding',
    'blockOnboarding',
    'grantControlledRuntimeAccess',
    'revokeParticipantOnboarding',
    'recordOnboardingFinding',
    'resolveOnboardingFinding',
    'buildOnboardingEvidencePack',
    'getOnboardingAuditTimeline',
    'getOnboardingDashboardState'
  ];

  for (const fn of requiredFns) {
    assert(typeof service[fn] === 'function', `Service exports ${fn}()`);
  }

  // Force mock mode
  process.env.DB_UNREACHABLE = 'true';

  // Create mock Phase 133 issued invite record first in acceptance service mock state
  const inviteRecordId = 'inv_test_134b';
  const rawCode = 'CLAIM-CODE-134B';
  const rawToken = 'CLAIM-TOKEN-134B';
  const crypto = require('crypto');
  const codeHash = crypto.createHash('sha256').update(rawCode).digest('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const mockInvite = {
    invite_record_id: inviteRecordId,
    issuance_gate_id: 'gate_test_134b',
    issuance_batch_id: 'batch_test_134b',
    tenant_id: 'tenant_test_134b',
    cohort_id: 'cohort_test_134b',
    invite_code_hash: codeHash,
    invite_token_hash: tokenHash,
    invite_status: 'ISSUED',
    expires_at: new Date(Date.now() + 24 * 3600 * 1000)
  };
  service.setMockState('phase133Invites', inviteRecordId, mockInvite);
  service.setMockState('phase133Gates', 'gate_test_134b', { gate_status: 'APPROVED' });
  service.setMockState('phase133EvidencePacks', 'gate_test_134b', { evidence_integrity_hash: 'integrity_hash_133' });

  // Create acceptance gate
  const gateId = 'agate_test_134b';
  const gate = await service.createInviteAcceptanceGate({
    acceptance_gate_id: gateId,
    invite_record_id: inviteRecordId,
    issuance_gate_id: 'gate_test_134b',
    issuance_batch_id: 'batch_test_134b',
    tenant_id: 'tenant_test_134b',
    cohort_id: 'cohort_test_134b'
  });
  assert(gate.gate_status === 'DRAFT', 'Gate created with DRAFT status');

  // Verify claim
  const claim = await service.verifyInviteClaim(gateId, rawCode, rawToken, null, '127.0.0.1', 'Mozilla');
  assert(claim.claim_status === 'VERIFIED', 'Invite claim verified successfully');

  // Bind identity
  const part = await service.bindParticipantIdentity(gateId, 'ext_01', 'email@test.com', 'Beta Tester');
  assert(part.participant_email_hash.length === 64, 'Participant email hashed properly');
  assert(part.participant_label.includes('REDACTED'), 'Participant label redacted');

  // Terms acceptance
  const terms = await service.recordTermsAcceptance(gateId, part.participant_id, 'v1.0', 'terms_hash_134b', 'admin', 'CLICKWRAP');
  assert(terms.terms_version === 'v1.0', 'Terms acceptance recorded');

  // Limits
  const limits = await service.defineOnboardingSessionLimits(gateId, part.participant_id, {
    max_sessions: 1,
    max_concurrent_sessions: 1,
    session_ttl_minutes: 60,
    daily_action_limit: 100
  });
  assert(limits.max_sessions === 1, 'Session limits defined');

  // Access policy
  const policy = await service.defineOnboardingAccessPolicy(gateId, part.participant_id, {
    allowed_features_json: ['read'],
    denied_features_json: ['admin']
  });
  assert(policy.policy_status === 'ACTIVE', 'Access policy defined');

  // Guardrails
  const gr = await service.runOnboardingGuardrailChecks(gateId);
  assert(gr.ok === true, 'Onboarding guardrails check passed');

  // Approvals
  const submit = await service.submitOnboardingForApproval(gateId, 'admin');
  assert(submit.status === 'PENDING_APPROVAL', 'State transitioned to PENDING_APPROVAL');

  const app = await service.approveOnboarding(gateId, 'admin');
  assert(app.status === 'APPROVED', 'State transitioned to APPROVED');

  // Evidence pack
  const pack = await service.buildOnboardingEvidencePack(gateId);
  assert(pack.evidence_schema_version === '134.0', 'Evidence pack built with schema version 134.0');

  // Audit timeline
  const timeline = await service.getOnboardingAuditTimeline(gateId);
  assert(timeline.length > 0, 'Audit timeline logs returned');

  console.log(`Smoke 134B: Finished. Passed: ${passed}, Failed: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
