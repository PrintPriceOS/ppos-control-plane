'use strict';

const ControlledBetaInviteIssuanceService = require('../src/api/services/controlledBetaInviteIssuanceService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 133E: Invite Issuance Execution Guardrails ===');
  const service = new ControlledBetaInviteIssuanceService();
  process.env.DB_UNREACHABLE = 'true';

  const gateId = 'gate_test_133e';
  const batchId = 'batch_test_133e';

  const gate = await service.createInviteIssuanceGate({
    issuance_gate_id: gateId,
    preparation_id: 'prep_e',
    tenant_id: 'tenant_e',
    cohort_id: 'cohort_e',
    max_invites_allowed: 10,
    max_invites_to_issue: 5
  });

  const batch = await service.createInviteIssuanceBatch({
    issuance_batch_id: batchId,
    issuance_gate_id: gateId,
    preparation_id: 'prep_e',
    tenant_id: 'tenant_e',
    cohort_id: 'cohort_e',
    requested_invite_count: 2
  });

  await service.addInviteIssuanceRecipient({
    issuance_recipient_id: 'recip_e1',
    issuance_batch_id: batchId,
    candidate_participant_id: 'cand_e1',
    tenant_id: 'tenant_e',
    cohort_id: 'cohort_e',
    recipient_email: 'user1@example.com'
  });

  // Setup ready dependency state
  service.setMockState('gates', 'prep_e', { preparation_status: 'APPROVED' });
  service.setMockState('gates', '', { evidence_integrity_hash: 'ev_e_hash' });
  service.setMockState('gates', 'phase131_cohort_e', { decision_status: 'APPROVED' });
  service.setMockState('gates', 'phase130_cohort_e', { evidence_integrity_hash: 'mon_hash' });
  service.setMockState('gates', 'phase129_cohort_e', { evidence_integrity_hash: 'act_hash' });
  service.setMockState('gates', 'phase128_1_cohort_e', { restart_safe: true });

  // 1. Try to issue before approval
  try {
    await service.issueApprovedInviteBatch(batchId, 'admin');
    assert(false, 'Should block invite issuance before manual approval');
  } catch (e) {
    assert(e.message.includes('Gate must be APPROVED'), 'Blocks invite issuance before approval');
  }

  // Submit and approve gate
  await service.submitInviteIssuanceForApproval(gateId);
  await service.approveInviteIssuance(gateId, 'admin');

  // 2. Issue batch
  const invites = await service.issueApprovedInviteBatch(batchId, 'admin');
  assert(invites.length === 1, 'Issued 1 invite record successfully');
  assert(invites[0].invite_code_hash.length === 64, 'Invite code is stored hashed');
  assert(invites[0].invite_token_hash.length === 64, 'Invite token is stored hashed');
  assert(!invites[0].invite_code, 'Raw invite code is not printed/returned');
  assert(!invites[0].invite_token, 'Raw invite token is not printed/returned');

  // 3. Revocation works
  const recordId = invites[0].invite_record_id;
  await service.revokeIssuedInvite(recordId, 'admin', 'Revocation test');
  
  const record = service._mockState.records.get(recordId);
  assert(record.invite_status === 'REVOKED', 'Revocation successfully transitions state to REVOKED');
  assert(record.revoked_by === 'admin', 'Revocation records actor ID');
  assert(record.revoke_reason === 'Revocation test', 'Revocation records reason string');

  console.log(`Smoke 133E: Finished. Passed: ${passed}, Failed: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
