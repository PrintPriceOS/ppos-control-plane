'use strict';

const service = require('../src/api/services/controlledBetaInviteAcceptanceService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 134G: Invite Acceptance Evidence Pack ===');
  process.env.DB_UNREACHABLE = 'true';

  const gateId = 'agate_test_134g';
  const inviteRecordId = 'inv_test_134g';

  // Setup gate
  await service.createInviteAcceptanceGate({
    acceptance_gate_id: gateId,
    invite_record_id: inviteRecordId,
    issuance_gate_id: 'gate_test_134g',
    issuance_batch_id: 'batch_test_134g',
    tenant_id: 'tenant_test_134g',
    cohort_id: 'cohort_test_134g'
  });

  const crypto = require('crypto');
  const codeHash = crypto.createHash('sha256').update('CLAIM-CODE-134B').digest('hex');
  const tokenHash = crypto.createHash('sha256').update('CLAIM-TOKEN-134B').digest('hex');

  // Verify claim + bind + terms + limits + policy
  const mockInvite = {
    invite_record_id: inviteRecordId,
    issuance_gate_id: 'gate_test_134g',
    issuance_batch_id: 'batch_test_134g',
    tenant_id: 'tenant_test_134g',
    cohort_id: 'cohort_test_134g',
    invite_code_hash: codeHash,
    invite_token_hash: tokenHash,
    invite_status: 'ISSUED',
    expires_at: new Date(Date.now() + 24 * 3600 * 1000)
  };
  service.setMockState('phase133Invites', inviteRecordId, mockInvite);
  await service.verifyInviteClaim(gateId, 'CLAIM-CODE-134B', 'CLAIM-TOKEN-134B', 'hash', '127.0.0.1', 'Mozilla');
  const part = await service.bindParticipantIdentity(gateId, 'ext_user', 'user@test.com', 'Tester');
  await service.recordTermsAcceptance(gateId, part.participant_id, 'v1.0', 'terms_hash', 'admin', 'CLICKWRAP');
  await service.defineOnboardingSessionLimits(gateId, part.participant_id, { max_sessions: 1 });
  await service.defineOnboardingAccessPolicy(gateId, part.participant_id, { allowed_features_json: ['read'] });

  const pack = await service.buildOnboardingEvidencePack(gateId);

  assert(pack.evidence_schema_version === '134.0', 'Evidence schema version is 134.0');
  assert(pack.evidence_integrity_hash.length === 64, 'Evidence integrity hash is calculated and present');
  assert(pack.redaction_status === 'REDACTED', 'Evidence status is marked REDACTED');

  const data = pack.evidence_data_json;
  assert(data.phase133_dependency.invite_record_id === inviteRecordId, 'Includes Phase 133 invite record dependency reference');
  assert(data.claim_verification.length > 0, 'Includes claim verification summary');
  assert(data.participant_summary.length > 0, 'Includes participant summary');
  assert(data.terms_acceptance.length > 0, 'Includes terms acceptance summary');
  assert(data.session_limits.length > 0, 'Includes session limits summary');
  assert(data.access_policy.length > 0, 'Includes access policy summary');
  assert(data.safety_invariants.full_public_enabled === 0 || data.safety_invariants.full_public_enabled === false, 'Confirms full_public_enabled is disabled');
  assert(data.redaction_proof.raw_invite_codes_excluded === true, 'Confirms raw codes are excluded');
  assert(data.redaction_proof.raw_invite_tokens_excluded === true, 'Confirms raw tokens are excluded');
  assert(data.redaction_proof.raw_emails_excluded === true, 'Confirms raw emails are excluded');

  console.log(`Smoke 134G: Finished. Passed: ${passed}, Failed: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
